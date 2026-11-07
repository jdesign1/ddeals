# Vercel deployment guard

The `vercel-deployment-guard` workflow runs for every push to `main`.

It first waits for the normal Vercel Git deployment. If no production deployment exists for the pushed commit after the discovery window, it creates one from the exact GitHub commit and waits for it to finish. This catches missed GitHub/Vercel webhook events without creating a second deployment when the normal integration is healthy.

## Required repository secret

Add a `VERCEL_TOKEN` repository secret with permission to deploy the `dodgy-deal-mobile` project in the `Dodgy Deal` team. The workflow keeps the project and team IDs in the workflow because they are identifiers, not credentials.

Use the narrowest Vercel token scope available, and rotate or revoke it through Vercel if it is ever exposed. The GitHub Actions token is only used to confirm that a fallback run still targets the current `main` tip; stale runs exit without creating a production deployment.

The guard intentionally fails with a clear error when the secret is missing or when Vercel reports a failed deployment. That keeps a missed or broken deployment visible instead of silently serving an older production build.

The fallback is protected against stale workflow runs by canceling older guard jobs and checking the current `main` tip before and after fallback creation. This is best-effort protection against a push landing in the narrow window around the Vercel API request; the newer `main` run remains authoritative.
