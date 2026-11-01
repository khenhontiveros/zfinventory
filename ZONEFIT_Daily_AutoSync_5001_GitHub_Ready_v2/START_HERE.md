# ZONEFIT - Daily automatic AS Colour stock sync (Staple Tee 5001)

## What this adds
A separate cloud checker for your **existing ZONEFIT Netlify v4 dashboard**, running at **06:17 Australia/Sydney daily**. It opens the Australian AS Colour Staple Tee page in Chromium, attempts to open the Bulk Order Grid, reads visible colour/size stock with the same extractor used in your working bookmarklet, then uses the existing ZONEFIT cloud API to store a new timestamped snapshot. Stock changes are visible in **Stock changes** and run status in **Sync activity**.

**No Netlify site rebuild is required**, and your previously imported data stays in place. You do need to set up this checker once in GitHub. No credentials are included in this download.

**Status:** The worker code and API contract have been tested using simulated webpages and the supplied user capture. It has NOT been successfully run against the live AS Colour site from a GitHub Actions runner. Some sites block unattended browsers or need authentication. Follow supplier terms/permissions and use an approved stock feed for long-term reliability. A green GitHub run only confirms success if it says `[SAVED]` and ZONEFIT records a new capture timestamp.

## 1. Confirm Netlify's worker token
In the SAME Netlify site where you can already log into ZONEFIT:

1. Open **Project configuration -> Environment variables**.
2. Make sure **ZONEFIT_WORKER_TOKEN** is set to a separate strong secret (not `ZONEFIT_ADMIN_TOKEN`), scoped to Functions/Runtime or All scopes, and available in Production.
3. If you just added or changed it, **redeploy Netlify so its Functions receive the new value**. If already configured and unchanged, you can skip the Netlify redeploy.
4. Keep your token private. Do not put it in files or screenshots.

## 2. Create a private GitHub repository for this checker
1. Sign in at https://github.com/ and create a **Private** repository named e.g. `zonefit-daily-stock`.
2. Extract this ZIP and upload **all the contents of this directory to the repository root**, including `.github/workflows/zonefit-daily-stock.yml` (the hidden `.github` directory matters). Easiest is GitHub Desktop: add the extracted folder, commit, publish as Private.
3. Make sure `package.json`, `scripts/`, `public/capture_collector.js`, `tests/`, and `.github/workflows/zonefit-daily-stock.yml` are visible in your repository.
4. Use `main` as the default branch (or ensure this workflow is committed to whatever your default branch is).

**You do not need to redeploy ZONEFIT itself**, and you do not need to move the dashboard into this repository. This is ONLY the daily checker.

## 3. Create two GitHub Actions repository secrets
GitHub repository -> **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Name | Secret value |
| --- | --- |
| `ZONEFIT_SITE_URL` | Your existing deployed site URL, e.g. `https://musical-griffin-cd1ed0.netlify.app` (replace if your current site differs) |
| `ZONEFIT_WORKER_TOKEN` | Exactly the same worker-token VALUE saved in Netlify, **not** your admin token and not its variable name |

Never put secrets in your repository or paste them in messages. Note: your Netlify admin token is NOT used by the worker.

## 4. Test before enabling daily stock writes
1. On GitHub go to **Actions -> ZONEFIT - Daily AS Colour stock sync**.
2. Click **Run workflow**, select `preview`, then **Run workflow**.
3. Open the run -> **Check Staple Tee 5001 -> Check supplier stock and report to ZONEFIT**.
4. Success looks like `[PREVIEW] 5001: ... trustworthy cells ... NOT uploaded.`
5. This check is **read-only** and deliberately does not change your stored inventory.
6. If preview is successful, run again with `sync` selected. Success looks like `[SAVED] 5001: ... verified readings ... changes`.
7. Visit your current Netlify dashboard: **Sync activity**, then **Product inventory -> Staple Tee**. Check the latest capture timestamp and compare actual sizes/colours against the supplier website.

The worker requires **at least 300 trustworthy colour/size observations, 35 colours, and 5 sizes** for style 5001. This is conservative and based on your previous successful capture (532 usable observations). Partial, blocked or ambiguous readings are **not uploaded**; existing inventory is preserved.

## 5. After success, daily refresh is scheduled
The GitHub workflow schedules at **06:17 every day in Australia/Sydney timezone**, with daylight-saving adjustment. Scheduled runs use `sync` mode automatically. You can inspect all attempts under **GitHub -> Actions**; successful uploads appear in **ZONEFIT -> Sync activity**.

GitHub scheduled jobs may start later than the specified time, be dropped during congestion, or stop running under some account/repository conditions. If no successful run occurred, stock is a **last-known snapshot**, not guaranteed live. Review the status periodically.

## 6. When adding more products
First add each matching *Australian* AS Colour product URL under ZONEFIT **Supplier links**. Then edit these two workflow environment lines in `.github/workflows/zonefit-daily-stock.yml`:

```
ZONEFIT_STYLE_CODES: '5001,4001'
ZONEFIT_MAX_STYLES: '2'
```

The worker validates the product page's matching style code before attempting capture. For now **only 5001** is enabled; other styles require their own validation and capture quality checks. A full 106-product run should use an approved feed or carefully tested batching instead of trying to scrape every product at once.

## Troubleshooting
- **Missing GitHub secrets**: create both repository secrets exactly as written.
- **401 Unauthorized worker**: `ZONEFIT_WORKER_TOKEN` values on GitHub and Netlify do not match, or Netlify Functions haven't been redeployed.
- **404 API endpoint**: verify you are using the actual current ZONEFIT site with backend Functions deployed, rather than an HTML-only Netlify Drop deployment.
- **No matching Australian AS Colour links**: open **Supplier links** and save `https://www.ascolour.com.au/staple-tee-5001/` for style 5001.
- **Incomplete supplier grid**: the hosted browser did not expose the complete stock grid; no data is changed. Continue manual capture or ask AS Colour for an approved inventory feed.
- **GitHub Actions not visible**: upload the `.github/workflows/` hidden directory and make sure it is committed on the repository default branch. Check that GitHub Actions are enabled in repository settings.
- **Scheduled run missed**: GitHub schedules are best effort; run a manual sync and check recent run history.

## Safety and limitations
No supplier credentials, CAPTCHA bypass, scraping evasion or made-up stock quantities. A parsed `0+` is never treated as a confirmed zero; repeated identical readings are also subject to ZONEFIT cloud validation. The existing Netlify API merges observations, leaving unobserved cells as last-known values rather than assuming out of stock. Confirm critical orders directly with the supplier.

## What is needed to finish activation
You must upload this folder to **your own GitHub repository**, configure the two GitHub secrets, run `preview`, and then run `sync`. I cannot activate the daily schedule in your accounts without those deployment steps. You can send a screenshot of the **GitHub Actions run summary** without any secrets for troubleshooting.
