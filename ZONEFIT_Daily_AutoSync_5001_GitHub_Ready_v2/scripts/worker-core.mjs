/*
  ZONEFIT daily AS Colour worker. Does not bypass supplier login, anti-bot checks,
  or access controls. Stops on incomplete/unverified data and preserves cloud stock.
*/
export const DEFAULT_CODE = '5001';
const AU_HOSTS = new Set(['ascolour.com.au', 'www.ascolour.com.au']);

export function normalCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function validAustralianProductURL(url, code = DEFAULT_CODE) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !AU_HOSTS.has(u.hostname.toLowerCase())) return false;
    const got = u.pathname.toUpperCase().match(/-(\d{3,5}[A-Z]?)\/?$/)?.[1];
    return got === normalCode(code);
  } catch { return false; }
}

export function filterProducts(products, codes = DEFAULT_CODE, maxStyles = 1) {
  const requested = String(codes || DEFAULT_CODE).trim().toUpperCase();
  const matchAll = requested === 'ALL';
  const selected = new Set(requested.split(/[\s,;]+/).map(normalCode).filter(Boolean));
  return (products || []).filter(p =>
    validAustralianProductURL(p.url, p.code) && (matchAll || selected.has(normalCode(p.code)))
  ).slice(0, Math.max(1, Math.min(30, Number(maxStyles) || 1)));
}

function numericStock(row) {
  const s = String(row?.quantity ?? '').trim().replace(/,/g, '');
  if (!/^(?:\d+)(?:\+)?$/.test(s) || /^0\+$/.test(s)) return false;
  return true;
}

export function validateCapture(capture, product, {min5001Rows = 300} = {}) {
  if (!capture || !Array.isArray(capture.records)) throw new Error('No colour/size grid found');
  const byKey = new Map();
  const conflicts = new Set();
  for (const item of capture.records) {
    const colour = String(item?.colour ?? '').trim();
    const size = String(item?.size ?? '').trim().toUpperCase();
    if (!colour || !size || !numericStock(item)) continue;
    const key = `${colour.toLowerCase()}|${size}`;
    const existing = byKey.get(key);
    if (conflicts.has(key)) continue;
    if (existing && existing.quantity !== item.quantity) {
      byKey.delete(key); // ambiguous duplicate cannot count toward the threshold
      conflicts.add(key);
      continue;
    }
    byKey.set(key, item);
  }
  const cells = byKey.size;
  const colours = new Set([...byKey.values()].map(r => r.colour.toLowerCase())).size;
  const sizes = new Set([...byKey.values()].map(r => r.size.toUpperCase())).size;
  const code = normalCode(product.code);
  const threshold = code === '5001' ? Math.max(50, Number(min5001Rows) || 300) : 4;
  const needColours = code === '5001' ? 35 : 1;
  const needSizes = code === '5001' ? 5 : 1;
  if (cells < threshold || colours < needColours || sizes < needSizes) {
    throw new Error(`Incomplete supplier grid: ${cells} trustworthy cells, ${colours} colours, ${sizes} sizes. ` +
      `Need at least ${threshold} cells, ${needColours} colours and ${needSizes} sizes. No stock was uploaded.`);
  }
  return {cells, colours, sizes, rawRecords: capture.records.length};
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 220);
}

export async function runWorker({
  site, token, collector, browserFactory, fetcher = fetch,
  mode = 'sync', codes = DEFAULT_CODE, maxStyles = 1,
  min5001Rows = 300, log = console, waitBetween = async () => {}
} = {}) {
  if (!site || !token) throw new Error('Missing GitHub secrets: ZONEFIT_SITE_URL or ZONEFIT_WORKER_TOKEN');
  const base = new URL(site);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('ZONEFIT_SITE_URL must be an HTTPS website origin, without extra paths');
  const origin = base.origin;
  if (!['preview','sync'].includes(mode)) throw new Error('ZONEFIT_MODE must be preview or sync');
  if (typeof browserFactory !== 'function') throw new Error('Chromium runner is missing');

  const request = async (action, data) => {
    const response = await fetcher(`${origin}/.netlify/functions/api?action=${encodeURIComponent(action)}`, {
      method: data ? 'POST' : 'GET',
      headers: {'Authorization': `Bearer ${token}`, ...(data ? {'Content-Type': 'application/json'} : {})},
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(60_000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = result.error || `HTTP ${response.status}`;
      if (response.status === 401) throw new Error('Netlify rejected ZONEFIT_WORKER_TOKEN (401). Set the SAME worker token in Netlify and GitHub.');
      if (response.status === 503) throw new Error(`Netlify worker is not configured (503): ${detail}. Save token in Netlify Functions scope and redeploy.`);
      if (response.status === 404) throw new Error('Netlify API endpoint not found (404). Confirm the full cloud project with Functions is deployed.');
      throw new Error(`ZONEFIT API ${action}: ${detail}`);
    }
    return result;
  };

  // Verify API and worker secret before visiting the supplier site.
  const data = await request('worker-products');
  const candidates = Array.isArray(data.products) ? data.products : [];
  const products = filterProducts(candidates, codes, maxStyles);
  if (!products.length) throw new Error(`No matching Australian AS Colour links for ${codes}. Confirm Staple Tee 5001 is linked in Supplier links.`);
  log.log(`ZONEFIT ${mode.toUpperCase()}: ${products.length} product(s) from ${origin}.`);
  const summary = {mode, checked: 0, saved: 0, previewed: 0, failed: 0, products: []};
  const browser = await browserFactory();
  try {
    for (const product of products) {
      summary.checked++;
      let context;
      try {
        context = await browser.newContext({viewport: {width: 1500, height: 1000}, locale: 'en-AU', timezoneId: 'Australia/Sydney'});
        const page = await context.newPage();
        await page.goto(product.url, {waitUntil: 'domcontentloaded', timeout: 40_000});
        if (!validAustralianProductURL(page.url(), product.code))
          throw new Error('Supplier redirected away from the matching Australian product page');
        await page.waitForTimeout(1800);
        const openGrid = page.getByText(/view bulk order grid/i);
        if (await openGrid.count()) {
          await openGrid.first().click({timeout: 8000}).catch(() => {});
          await page.waitForTimeout(1600);
        }
        // Same extractor as the bookmarklet that the user tested in Chrome.
        await page.addScriptTag({content: collector});
        let captured,quality,lastError;
        for (let attempt = 0; attempt < 4; attempt++) {
          captured = await page.evaluate(() => window.zonefitCollectVariants(document));
          try {
            quality = validateCapture(captured, product, {min5001Rows});
            break;
          } catch(error) {
            lastError = error;
            if (attempt < 3) await page.waitForTimeout(2500);
          }
        }
        if (!quality) throw lastError || new Error('Could not validate supplier grid');
        // Data originate from this Australian product page; never invent stock values.
        if (mode === 'preview') {
          summary.previewed++;
          summary.products.push({code: product.code, result: 'preview', ...quality});
          log.log(`[PREVIEW] ${product.code}: ${quality.cells} trustworthy cells, ${quality.colours} colours, ${quality.sizes} sizes. NOT uploaded.`);
        } else {
          const payload = {source: page.url(), capturedAt: new Date().toISOString(), records: captured.records, diagnostics: captured.diagnostics};
          const result = await request('worker-capture', {productId: product.id, payload});
          summary.saved++;
          summary.products.push({code: product.code, result: 'saved', ...quality, observed: result.observed, changes: result.changes});
          log.log(`[SAVED] ${product.code}: ${result.observed} verified readings, ${result.changes} detected changes.`);
        }
      } catch(error) {
        summary.failed++;
        const message = safeMessage(error);
        summary.products.push({code: product.code, result: 'failed', message});
        log.error(`[FAILED] ${product.code}: ${message}`);
        // A failed preview should not overwrite or pollute the live cloud data.
        if (mode === 'sync') await request('worker-report', {productId: product.id, message}).catch(() => {});
      } finally {
        if (context) await context.close().catch(() => {});
        await waitBetween();
      }
    }
  } finally { await browser.close(); }
  return summary;
}
