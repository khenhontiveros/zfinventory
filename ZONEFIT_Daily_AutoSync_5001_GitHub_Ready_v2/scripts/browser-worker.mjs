import {appendFile, readFile} from 'node:fs/promises';
import {runWorker} from './worker-core.mjs';

async function main() {
  const mode = String(process.env.ZONEFIT_MODE || 'sync').toLowerCase();
  const site = process.env.ZONEFIT_SITE_URL || '';
  const token = process.env.ZONEFIT_WORKER_TOKEN || '';
  // Don't log either secret or the Authorization request header.
  const collector = await readFile(new URL('../public/capture_collector.js', import.meta.url), 'utf8');
  const {chromium} = await import('playwright');
  const summary = await runWorker({
    mode, site, token, collector,
    codes: process.env.ZONEFIT_STYLE_CODES || '5001',
    maxStyles: Number(process.env.ZONEFIT_MAX_STYLES || 1),
    min5001Rows: Number(process.env.ZONEFIT_MIN_5001_ROWS || 300),
    browserFactory: () => chromium.launch({headless: true}),
    waitBetween: () => new Promise(resolve => setTimeout(resolve, 2500))
  });
  console.log(`Complete: checked ${summary.checked}; saved ${summary.saved}; previewed ${summary.previewed}; failed ${summary.failed}.`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = summary.products.map(x => `| ${x.code} | ${x.result} | ${x.cells ?? '-'} | ${x.changes ?? '-'} | ${String(x.message || '').replace(/\|/g, '/')} |`);
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## ZONEFIT AS Colour stock check',
      `**Mode:** ${mode}  \n**Time:** ${new Date().toISOString()}`,
      '| Style | Status | Verified cells | Changes | Details |',
      '|:---|:---|---:|---:|:---|', ...rows,
      '', summary.failed ? '**Action required:** Supplier extraction failed. Existing ZONEFIT stock was preserved.' :
      mode === 'preview' ? '**Preview only:** No inventory was changed. Run again with mode `sync` to update.' :
      '**Success:** Open ZONEFIT > Sync activity to see the latest supplier snapshot.', ''
    ].join('\n'));
  }
  if (summary.failed) process.exitCode = 1;
}

main().catch(async error => {
  console.error('[SETUP ERROR]', error.message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## ZONEFIT setup error\n${error.message}\n`).catch(() => {});
  }
  process.exitCode = 1;
});
