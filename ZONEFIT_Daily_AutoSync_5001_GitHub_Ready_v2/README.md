# ZONEFIT Daily Auto-Sync 5001

Standalone GitHub Actions / Playwright worker for the **existing** Netlify ZONEFIT v4 stock dashboard.

**Read [START_HERE.md](START_HERE.md)** for GitHub setup, secrets, first manual `preview` and `sync`, daily schedule, limitations, and troubleshooting.

This does not replace or redeploy the ZONEFIT website. No real access tokens or supplier inventory are bundled.

Test with `npm test`. Execute with `npm run worker` after installing Playwright and setting `ZONEFIT_SITE_URL` and `ZONEFIT_WORKER_TOKEN`.
