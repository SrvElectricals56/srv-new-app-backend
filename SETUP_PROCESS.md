# SRV Project Setup Process

Prepared for: New developer onboarding and deployment preparation  
Last updated: 2026-06-24  
Projects covered:

- Backend API: `C:\Users\dell\Desktop\ADMIN-BACKEND`
- Admin Frontend: `C:\Users\dell\Desktop\ADMIN-FRONTEND`
- App Frontend: `C:\Users\dell\Desktop\NEW APP`

This document explains how to set up and run all three SRV projects from a fresh machine or fresh project folder.

## 1. Required Software

Install these before starting.

| Tool | Purpose | Recommended Check Command |
| --- | --- | --- |
| Node.js 20 LTS or newer | Runs backend, admin frontend, and Expo tooling | `node -v` |
| npm | Installs project dependencies | `npm -v` |
| Git | Clone/pull project source code | `git --version` |
| Docker Desktop | Easiest local PostgreSQL setup | `docker --version` |
| Docker Compose | Runs PostgreSQL from backend compose file | `docker compose version` |
| PostgreSQL client tools | Optional, useful for `psql` imports | `psql --version` |
| Android Studio | Required for Android emulator/native Expo builds | Open Android Studio |
| Expo tooling | Runs mobile app through project dependency | `npx expo --version` |

If `npx expo --version` does not work before dependencies are installed, that is fine. It should work after running `npm install` inside the app frontend folder.

## 2. Project URLs And Ports

| Service | Default Local URL |
| --- | --- |
| Backend API root | `http://localhost:3001/api/v1` |
| Backend Swagger docs | `http://localhost:3001/api/docs` |
| Backend health check | `http://localhost:3001/health` |
| Admin Frontend | `http://localhost:3000` |
| Expo web preview | `http://localhost:8081` or the URL printed by Expo |
| PostgreSQL Docker host port | `localhost:5433` |
| PostgreSQL container port | `5432` |
| Database name | `srv_admin` |

For a physical mobile device, replace `localhost` with the computer LAN IP address.

Example:

```powershell
ipconfig
```

If the computer IP is `192.168.29.8`, use:

```text
http://192.168.29.8:3001/api/v1
```

## 3. Recommended Setup Order

Always start in this order:

1. Database
2. Backend API
3. Admin Frontend
4. App Frontend

The backend needs PostgreSQL before it can run correctly. Both frontends need the backend API URL.

## 4. Backend Setup

### 4.1 Open Backend Folder

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
```

### 4.2 Install Backend Dependencies

For a new machine or fresh clone:

```powershell
npm install
```

If the project is clean and `package-lock.json` is committed, this command can also be used for stricter installs:

```powershell
npm ci
```

### 4.3 Create Backend Environment File

Create or update this file:

```text
C:\Users\dell\Desktop\ADMIN-BACKEND\.env
```

Use this template for local development:

```env
NODE_ENV=development
PORT=3001
SERVER_HOST=0.0.0.0

DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_DATABASE=srv_admin
DB_SYNCHRONIZE=true
DB_LOGGING=false

DATABASE_URL=postgresql://postgres:your_postgres_password@localhost:5433/srv_admin?schema=public

JWT_SECRET=replace_with_secure_access_secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace_with_secure_refresh_secret
JWT_REFRESH_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:3000,http://localhost:8081,http://192.168.29.8:3000,http://192.168.29.8:8081
CORS_CREDENTIALS=true
API_PREFIX=api/v1

RAZORPAY_KEY_ID=replace_with_razorpay_key_id
RAZORPAY_KEY_SECRET=replace_with_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=replace_with_razorpay_webhook_secret

THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

Important notes:

- `DB_PORT=5433` matches the included Docker Compose PostgreSQL mapping.
- `DATABASE_URL` is required by Prisma tooling.
- `DB_SYNCHRONIZE=true` is acceptable for local development only.
- For production, use reviewed migrations/schema and set `DB_SYNCHRONIZE=false`.
- Add any LAN frontend URL to `CORS_ORIGIN` when testing from a phone or another device.

### 4.4 Start PostgreSQL With Docker

From the backend folder:

```powershell
docker compose up -d postgres
```

Check the database container:

```powershell
docker ps
```

Check database logs:

```powershell
docker logs srv_admin_postgres
```

Stop PostgreSQL:

```powershell
docker compose stop postgres
```

Stop and remove compose containers:

```powershell
docker compose down
```

Delete the PostgreSQL Docker volume only when you intentionally want to erase local database data:

```powershell
docker compose down -v
```

### 4.5 Create Database Manually If Needed

If the database does not exist, create it inside the Docker container:

```powershell
docker exec -it srv_admin_postgres psql -U postgres -c "CREATE DATABASE srv_admin;"
```

If it already exists, this command may show an error. That is normal.

### 4.6 Restore Existing SQL Data

If you have a SQL dump file, copy it into the PostgreSQL container and import it.

Example using the current backend dump file:

```powershell
docker cp ".\srv_admin_before_upadted.sql" srv_admin_postgres:/tmp/srv_admin_before_upadted.sql
```

```powershell
docker exec -it srv_admin_postgres psql -U postgres -d srv_admin -f /tmp/srv_admin_before_upadted.sql
```

If `psql` is installed locally, you can also run:

```powershell
psql -h localhost -p 5433 -U postgres -d srv_admin -f ".\srv_admin_before_upadted.sql"
```

To fully recreate the database before import:

```powershell
docker exec -it srv_admin_postgres psql -U postgres -c "DROP DATABASE IF EXISTS srv_admin;"
```

```powershell
docker exec -it srv_admin_postgres psql -U postgres -c "CREATE DATABASE srv_admin;"
```

```powershell
docker cp ".\srv_admin_before_upadted.sql" srv_admin_postgres:/tmp/srv_admin_before_upadted.sql
```

```powershell
docker exec -it srv_admin_postgres psql -U postgres -d srv_admin -f /tmp/srv_admin_before_upadted.sql
```

### 4.7 Generate Prisma Client

Prisma is not the main runtime ORM, but the backend still contains Prisma schema/tooling. Run this after dependency install:

```powershell
npx prisma generate
```

Optional Prisma Studio:

```powershell
npm run studio
```

### 4.8 Run TypeORM Migrations If Required

The backend has TypeORM migration commands.

Run migrations:

```powershell
npm run migration:run
```

Revert last migration:

```powershell
npm run migration:revert
```

Generate migration:

```powershell
npm run migration:generate -- src/database/migrations/MigrationName
```

For local setup with an existing SQL dump, migrations may already be included in the imported database. Do not run destructive database commands without backup.

### 4.9 Run Backend In Development

```powershell
npm run start:dev
```

Expected URLs:

```text
http://localhost:3001/api/v1
http://localhost:3001/api/docs
http://localhost:3001/health
```

### 4.10 Backend Production Commands

Build backend:

```powershell
npm run build
```

Run built backend:

```powershell
npm run start:prod
```

Run normal start:

```powershell
npm run start
```

Run debug mode:

```powershell
npm run start:debug
```

Run tests:

```powershell
npm run test
```

Run test coverage:

```powershell
npm run test:cov
```

Run lint:

```powershell
npm run lint
```

## 5. Admin Frontend Setup

### 5.1 Open Admin Frontend Folder

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
```

### 5.2 Install Admin Frontend Dependencies

```powershell
npm install
```

Or, for a strict lockfile install:

```powershell
npm ci
```

### 5.3 Create Admin Frontend Environment File

Create or update:

```text
C:\Users\dell\Desktop\ADMIN-FRONTEND\.env.local
```

For browser testing on the same computer:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

For LAN/mobile network testing:

```env
NEXT_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
```

Use the actual computer IP from `ipconfig`.

### 5.4 Run Admin Frontend

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

### 5.5 Admin Frontend Build Commands

Build:

```powershell
npm run build
```

Run production build:

```powershell
npm run start
```

Lint:

```powershell
npm run lint
```

## 6. App Frontend Setup

### 6.1 Open App Frontend Folder

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
```

### 6.2 Install App Frontend Dependencies

```powershell
npm install
```

Or, for a strict lockfile install:

```powershell
npm ci
```

### 6.3 Create App Environment File

Create or update:

```text
C:\Users\dell\Desktop\NEW APP\.env
```

For web testing on the same computer:

```env
EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
```

For Android emulator:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001/api/v1
```

For a physical phone on the same Wi-Fi:

```env
EXPO_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
```

Use the actual computer IP from `ipconfig`.

If a physical phone cannot reach the backend, make sure Windows Firewall allows inbound traffic on port `3001`.

### 6.4 Start Expo

```powershell
npm run start
```

This runs:

```powershell
expo start
```

### 6.5 Run App On Android

For an Android emulator or connected Android device:

```powershell
npm run android
```

If using an Android emulator and the app cannot reach the backend, forward the backend port:

```powershell
adb reverse tcp:3001 tcp:3001
```

Check connected devices:

```powershell
adb devices
```

### 6.6 Run App On Web

```powershell
npm run web
```

### 6.7 Other App Commands

Run iOS:

```powershell
npm run ios
```

Lint:

```powershell
npm run lint
```

Auto-fix lint:

```powershell
npm run lint:fix
```

Format:

```powershell
npm run format
```

Check formatting:

```powershell
npm run format:check
```

## 7. Full First-Time Setup Command Sequence

Use this sequence when setting everything up from zero.

### Terminal 1: Database And Backend

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
```

```powershell
npm install
```

```powershell
docker compose up -d postgres
```

```powershell
npx prisma generate
```

```powershell
npm run start:dev
```

### Terminal 2: Admin Frontend

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
```

```powershell
npm install
```

```powershell
npm run dev
```

### Terminal 3: App Frontend

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
```

```powershell
npm install
```

```powershell
npm run start
```

For Android:

```powershell
npm run android
```

For web:

```powershell
npm run web
```

## 8. Verification Checklist

### Backend

Open:

```text
http://localhost:3001/health
```

Expected result:

```json
{
  "status": "ok"
}
```

Open Swagger:

```text
http://localhost:3001/api/docs
```

### Admin Frontend

Open:

```text
http://localhost:3000
```

Check:

- Login page loads.
- Admin login works.
- Dashboard APIs load without CORS errors.
- Product orders page loads.
- Uploaded images and files load through `/uploads`.

### App Frontend

Check:

- Login/signup opens.
- Product list loads.
- Profile screen loads.
- Cart/order API calls work.
- QR scan screen opens camera permission prompt.
- Razorpay checkout can be opened in the intended environment.

## 9. Common Problems And Fixes

### Backend Cannot Connect To Database

Check Docker container:

```powershell
docker ps
```

Check backend `.env`:

```env
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_DATABASE=srv_admin
```

Check database logs:

```powershell
docker logs srv_admin_postgres
```

### Admin Frontend Shows API Or CORS Error

Confirm backend is running:

```text
http://localhost:3001/health
```

Confirm admin `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

If using LAN IP, also add the admin frontend origin to backend `CORS_ORIGIN`.

### Mobile App Cannot Reach Backend

For physical device:

```env
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:3001/api/v1
```

Then restart Expo:

```powershell
npm run start
```

For Android emulator:

```powershell
adb reverse tcp:3001 tcp:3001
```

### Port Already In Use

Find process using port `3001`:

```powershell
netstat -ano | findstr :3001
```

Find process using port `3000`:

```powershell
netstat -ano | findstr :3000
```

Stop the process by PID:

```powershell
taskkill /PID <PID> /F
```

### Dependency Install Fails

Clean install:

```powershell
Remove-Item -Recurse -Force node_modules
```

```powershell
Remove-Item -Force package-lock.json
```

```powershell
npm install
```

Only remove `package-lock.json` when the team agrees. For normal setup, keep the lockfile.

## 10. Deployment Preparation Notes

Before deployment:

1. Set `NODE_ENV=production`.
2. Set `DB_SYNCHRONIZE=false`.
3. Use a production PostgreSQL database.
4. Use strong JWT secrets.
5. Use production Razorpay keys.
6. Set exact production frontend URLs in `CORS_ORIGIN`.
7. Run backend build.
8. Run admin frontend build.
9. Test all login, order, payment, upload, and notification flows.
10. Keep a full PostgreSQL backup before any cleanup or migration.

## 11. Quick Command Reference

| Project | Folder | Install | Development Run | Build |
| --- | --- | --- | --- | --- |
| Backend | `C:\Users\dell\Desktop\ADMIN-BACKEND` | `npm install` | `npm run start:dev` | `npm run build` |
| Admin Frontend | `C:\Users\dell\Desktop\ADMIN-FRONTEND` | `npm install` | `npm run dev` | `npm run build` |
| App Frontend | `C:\Users\dell\Desktop\NEW APP` | `npm install` | `npm run start` | Use Expo/EAS build flow |

Database:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
```

```powershell
docker compose up -d postgres
```

Backend:

```powershell
npm run start:dev
```

Admin:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
```

```powershell
npm run dev
```

App:

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
```

```powershell
npm run start
```
