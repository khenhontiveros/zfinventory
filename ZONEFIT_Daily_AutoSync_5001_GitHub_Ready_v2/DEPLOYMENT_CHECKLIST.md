# ZONEFIT 5001 worker - deployment checklist

This package is a GitHub Actions worker, NOT a standalone Netlify website. Keep your existing working ZONEFIT dashboard deployed on Netlify.

1. Rotate any admin token exposed in screenshots. Use a different, strong ZONEFIT_WORKER_TOKEN in Netlify production Functions scope.
2. Redeploy your existing Netlify dashboard after changing environment variables.
3. Extract this ZIP and upload its CONTENTS (including hidden .github folder) to the root of a private GitHub repository.
4. In GitHub > Settings > Secrets and variables > Actions, add ZONEFIT_SITE_URL (your live Netlify URL) and ZONEFIT_WORKER_TOKEN (same value as Netlify's worker token). Never commit secrets.
5. In GitHub > Actions > ZONEFIT - Daily AS Colour stock sync, run workflow in preview mode. Inspect logs and confirm adequate trustworthy 5001 stock observations.
6. Only after preview succeeds, manually run sync mode. Confirm the capture timestamp and values in your existing ZONEFIT dashboard.
7. Scheduled syncs are best-effort. Live supplier access from GitHub-hosted Chromium has not been verified; the supplier may block automated capture.

See START_HERE.md for full instructions and troubleshooting.
