# SRV Admin Stack

This repository is the Docker entry point for the SRV backend, PostgreSQL database, pgAdmin, the admin frontend in `../ADMIN-FRONTEND`, and the Expo app in `../NEW APP`.

## Services

| Service | URL | Notes |
| --- | --- | --- |
| Admin frontend | http://localhost:3000 | Next.js admin panel |
| Mobile app web preview | http://localhost:8081 | Expo app running in Docker |
| Backend API | http://localhost:3001/api/v1 | NestJS + TypeORM |
| Swagger docs | http://localhost:3001/api/docs | API documentation |
| pgAdmin | http://localhost:5050 | `admin@admin.com` / `admin123` |
| PostgreSQL | localhost:5433 | `postgres` / `4268`, database `srv_admin` |

## Run Everything

```powershell
docker compose up --build
```

PostgreSQL imports `sql/upadted.sql` automatically when the `postgres_data` volume is first created. pgAdmin is preconfigured with the `SRV Docker Postgres` server; use database password `4268` if pgAdmin asks for it.

## Backend Local Dev

Use this when you want to run the backend from VS Code with `npm run start:dev`.

```powershell
docker compose up -d postgres pgadmin
npm run start:dev
```

If the Docker backend is already running, stop only that service first because both Docker backend and local Nest use port `3001`:

```powershell
docker compose stop backend
npm run start:dev
```

Keep `DB_SYNCHRONIZE=false` in `.env`. The imported SQL dump already defines the live schema, and the Docker init scripts add the current missing TypeORM tables.

`DB_HOST=postgres` is only valid inside Docker Compose. For a backend started directly from Windows/VS Code, use `DB_HOST=127.0.0.1` with local PostgreSQL on `5432`, or `DB_HOST=localhost` with Docker PostgreSQL exposed on `5433`. The backend now fails fast with a clear configuration error if these modes are mixed.

For deployment, set `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_URL` to the real public API origin, for example `https://api.your-domain.com/api/v1`. The local default uses `127.0.0.1` only to avoid Windows/WSL `localhost` routing conflicts during development.

## Reload The SQL Dump

Postgres only runs files in `docker-entrypoint-initdb.d` on a fresh data directory. To reload `sql/upadted.sql` from scratch:

```powershell
docker compose down -v
docker compose up --build
```

## Mobile App

The Expo app in `../NEW APP` is included in Docker as `mobile-app` and is available as a web preview at:

```text
http://localhost:8081
```

For a physical phone running Expo outside Docker, point the app to the same backend using your machine LAN IP:

```text
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001/api/v1
```

Use `http://localhost:3001/api/v1` for web, and your machine LAN IP for a physical phone.

## Database Layer

The backend uses TypeORM. Prisma has been removed from runtime and dependencies.
