# SRV database UI (pgAdmin)

The local Docker stack includes pgAdmin at <http://127.0.0.1:5050>.

1. Set unique `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` values in
   the untracked `.env` file.
2. Start the stack with `docker compose up -d postgres pgadmin`.
3. Sign in with `PGADMIN_DEFAULT_EMAIL` and
   `PGADMIN_DEFAULT_PASSWORD` from the local `.env` file.
4. Expand **Servers > SRV Docker Postgres**.
5. When prompted for the database password, enter `DB_PASSWORD` from `.env`.
6. Browse **Databases > srv_admin > Schemas > public > Tables**. Right-click a
   table and choose **View/Edit Data > All Rows**.

The tracked server definition intentionally contains no database password. Both
PostgreSQL and pgAdmin listen only on `127.0.0.1`.

## Production access

Production pgAdmin is disabled by default and must never be exposed through
Nginx or a public firewall rule.

1. On the server, copy `ops/deployment/pgadmin.env.example` to
   `/opt/srv/secrets/pgadmin.env`, set a unique email and a randomly generated
   password, then run `chmod 0640 /opt/srv/secrets/pgadmin.env`.
2. Create a query-only PostgreSQL role with:

   ```bash
   sudo -u srvdeploy TARGET_DATABASE=srv_production_20260716 \
     bash /opt/srv/current/srv-new-app-backend/ops/deployment/configure-pgadmin-readonly-role.sh
   ```

   The generated database credentials are stored in
   `/opt/srv/secrets/pgadmin-database-readonly.env` with restricted permissions.
3. Start only the opt-in database tool:

   ```bash
   cd /opt/srv/current/srv-new-app-backend
   sudo PGADMIN_ENV_FILE=/opt/srv/secrets/pgadmin.env \
     docker compose -f docker-compose.production.yml \
     --profile database-tools up -d pgadmin
   ```

4. From your own computer, open an SSH tunnel:

   ```bash
   ssh -N -L 5050:127.0.0.1:5050 srvdeploy@YOUR_SERVER_IP
   ```

5. Open <http://127.0.0.1:5050>, sign in with the pgAdmin UI account, choose
   **Add New Server**, and enter the host, port, database, username, TLS mode,
   and CA details from the generated read-only credential file. In pgAdmin's
   **SSL** tab, use `/certs/managed-postgres-ca.crt` as the root certificate.

The query-only role has no write, schema-creation, superuser, replication, or
role-management privileges. Stop pgAdmin when it is not needed:

```bash
sudo docker compose -f docker-compose.production.yml \
  --profile database-tools stop pgadmin
```
