# SRV Admin Stack

This repository is the Docker entry point for the SRV backend, PostgreSQL database, pgAdmin, the admin frontend in `../srv-new-adminpanel`, and the Expo app in `../srv-new-app-frontend`.

## Services

| Service | URL | Notes |
| --- | --- | --- |
| Admin frontend | http://localhost:3000 | Next.js admin panel |
| Mobile app web preview | http://localhost:8081 | Expo app running in Docker |
| Backend API | http://localhost:3001/api/v1 | NestJS + TypeORM |
| Swagger docs | http://localhost:3001/api/docs | API documentation |
| pgAdmin | http://127.0.0.1:5050 | Login is read from the untracked `.env` |
| PostgreSQL | 127.0.0.1:5433 | Credentials are read from the untracked `.env` |

## Run Everything

```powershell
docker compose up -d --build
```

On a new database volume, the backend creates the schema through TypeORM migrations. This repository does not include a SQL data dump, so a new volume has no application records. Existing data must be restored or imported separately. pgAdmin is preconfigured with the `SRV Docker Postgres` server; use `DB_PASSWORD` from `.env` if pgAdmin asks for it. Database and pgAdmin ports bind only to loopback and are not exposed to the LAN.

See [DATABASE_UI.md](DATABASE_UI.md) for local and production pgAdmin instructions. Production pgAdmin is an opt-in tool profile that is reachable only through an SSH tunnel.

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

Keep `DB_SYNCHRONIZE=false` in `.env`. The backend runs migrations at startup.

`DB_HOST=postgres` is only valid inside Docker Compose. For a backend started directly from Windows/VS Code, use `DB_HOST=127.0.0.1` with local PostgreSQL on `5432`, or with Docker PostgreSQL exposed on `5433` and `DB_PORT=5433`. The backend fails fast if these modes are mixed.

For deployment, set `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_URL` to the real public API origin, for example `https://api.your-domain.com/api/v1`. The local default uses `127.0.0.1` only to avoid Windows/WSL `localhost` routing conflicts during development.

## Database Data

`docker compose down` stops the stack while preserving its PostgreSQL volume. Avoid deleting the volume when you need to keep local data. To load existing data into a new stack, restore a PostgreSQL backup before starting the backend migrations.

## Mobile App

The Expo app in `../srv-new-app-frontend` is included in Docker as `mobile-app` and is available as a web preview at:

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
