# SRV database UI

The local Docker stack includes pgAdmin at <http://127.0.0.1:5050>.

1. Start the stack with `docker-compose up -d postgres pgadmin`.
2. Sign in with `PGADMIN_DEFAULT_EMAIL` (defaults to `admin@admin.com`) and
   `PGADMIN_DEFAULT_PASSWORD` from the local `.env` file.
3. Expand **Servers > SRV Docker Postgres**.
4. When prompted for the database password, enter `DB_PASSWORD` from `.env`.
5. Browse **Databases > srv_admin > Schemas > public > Tables**. Right-click a
   table and choose **View/Edit Data > All Rows**.

The tracked server definition intentionally contains no password. Production
pgAdmin is not exposed by `docker-compose.production.yml`; inspect production
data only through an authenticated SSH tunnel or the managed database console.
