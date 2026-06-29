# SRV staging workflow

## Branch contract

- `staging` is the integration and acceptance-test branch.
- `master` contains only code already verified on staging.
- Merge `master` into `staging` before each release; after acceptance, fast-forward
  `master` to the verified staging commit.
- Never edit or run `git pull` inside `/opt/srv/current`.

## Server layout

- Bare Git mirrors: `/opt/srv/repositories/*.git`
- Immutable releases: `/opt/srv/releases/git-*`
- Active release: `/opt/srv/current`
- Secrets and database CA: `/opt/srv/secrets`
- Persistent uploads: `/opt/srv/shared/uploads`

Deploy the current remote `staging` commits with:

```bash
ssh srvdeploy@139.59.52.48
srv-deploy-staging
```

The deployment records the backend, admin, and mobile commit IDs, builds new
images, runs pending TypeORM schema migrations, replaces the containers, and
runs authenticated smoke tests. A failed application deployment restores the
previous immutable release.

Legacy MySQL data transforms are separate from ordinary code deployment. Run
them only against an explicitly selected migration database and always require
`40-reconcile.sql` to pass before promotion.

## Staging acceptance checks

1. `/healthz` and `/api-healthz` return HTTP 200.
2. Admin login, authorization, dashboard, users, sub-dealers, catalog, QR Hub,
   gift orders, financial, content, support, and settings pages load without
   400/500 responses.
3. QR preview succeeds without redeeming the code.
4. PostgreSQL reconciliation totals match the source dump.
5. Mobile TypeScript/lint and Android bundle compilation pass.
6. The installable EAS staging build uses the staging API and tests camera,
   notifications, Razorpay, wallet, QR scanning, and logout on a physical phone.

Production requires HTTPS, production-only secrets, a final MySQL dump, a new
reconciliation run, backups, and an approved rollback window.
