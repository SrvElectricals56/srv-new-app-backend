# SRV Projects Run Guide

This guide explains how to run all three SRV projects step by step:

- Backend: `C:\Users\dell\Desktop\ADMIN-BACKEND`
- Admin Frontend: `C:\Users\dell\Desktop\ADMIN-FRONTEND`
- App Frontend: `C:\Users\dell\Desktop\NEW APP`

Use Windows PowerShell for these commands.

---

## 1. Required Software

Install these first:

- Node.js 18 or newer
- npm
- PostgreSQL or Docker Desktop
- Git
- Expo CLI through `npx expo` or local project dependency
- Android Studio / emulator if running the app on Android emulator

Check versions:

```powershell
node -v
npm -v
git --version
docker --version
docker compose version
```

---

## 2. Project Ports And URLs

Default local project URLs:

- Backend API: `http://192.168.29.8:3001/api/v1`
- Admin Frontend: `http://192.168.29.8:3000`
- PostgreSQL Docker host port: `5433`
- Database name: `srv_admin`

Important env files:

- Backend env: `C:\Users\dell\Desktop\ADMIN-BACKEND\.env`
- Admin frontend env: `C:\Users\dell\Desktop\ADMIN-FRONTEND\.env.local`
- App frontend env: `C:\Users\dell\Desktop\NEW APP\.env`

Current frontend API values should point to backend:

```env
NEXT_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
EXPO_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
```

---

## 3. Recommended Run Order

Always start projects in this order:

1. Database
2. Backend
3. Admin Frontend
4. App Frontend

Reason: both frontend projects need backend APIs, and backend needs database.

---

## 4. Backend Setup And Run

### 4.1 Open Backend Folder

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
```

### 4.2 Install Dependencies

Run once after cloning or when `package-lock.json` changes:

```powershell
npm install
```

### 4.3 Start Database With Docker

If Docker Desktop is available, start PostgreSQL from backend compose file:

```powershell
docker compose up -d postgres
```

Check running containers:

```powershell
docker ps
```

Check database container logs:

```powershell
docker logs srv_admin_postgres
```

Stop only database container:

```powershell
docker compose stop postgres
```

Stop and remove compose containers:

```powershell
docker compose down
```

Stop and remove containers plus database volume data:

```powershell
docker compose down -v
```

Use `down -v` carefully because it deletes the Docker database volume.

### 4.4 Import SQL Dump Into Database

If using a SQL dump file, run this from backend folder.

Example for `updated.sql`:

```powershell
psql -h localhost -p 5433 -U postgres -d srv_admin -f ".\updated.sql"
```

If `psql` is not installed locally but Docker PostgreSQL is running:

```powershell
docker cp ".\updated.sql" srv_admin_postgres:/tmp/updated.sql
docker exec -it srv_admin_postgres psql -U postgres -d srv_admin -f /tmp/updated.sql
```

If you need to recreate the database before importing:

```powershell
docker exec -it srv_admin_postgres psql -U postgres -c "DROP DATABASE IF EXISTS srv_admin;"
docker exec -it srv_admin_postgres psql -U postgres -c "CREATE DATABASE srv_admin;"
docker cp ".\updated.sql" srv_admin_postgres:/tmp/updated.sql
docker exec -it srv_admin_postgres psql -U postgres -d srv_admin -f /tmp/updated.sql
```

### 4.5 Run Backend In Development

```powershell
npm run start:dev
```

Backend should run on:

```text
http://192.168.29.8:3001/api/v1
```

### 4.6 Other Backend Commands

Build backend:

```powershell
npm run build
```

Run built backend:

```powershell
npm run start:prod
```

Run normal Nest start:

```powershell
npm run start
```

Run debug mode:

```powershell
npm run start:debug
```

Run lint:

```powershell
npm run lint
```

Run tests:

```powershell
npm run test
```

Run test watch:

```powershell
npm run test:watch
```

Run coverage:

```powershell
npm run test:cov
```

Run e2e tests:

```powershell
npm run test:e2e
```

Open Prisma Studio:

```powershell
npm run studio
```

or:

```powershell
npx prisma studio
```

---

## 5. Backend Full Docker Run

The backend includes `Dockerfile` and `docker-compose.yml`.

### 5.1 Build And Start Backend + Database

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
docker compose up -d --build
```

This starts:

- `srv_admin_postgres`
- `srv_admin_app`

### 5.2 View Docker Logs

All services:

```powershell
docker compose logs -f
```

Backend app only:

```powershell
docker logs -f srv_admin_app
```

Postgres only:

```powershell
docker logs -f srv_admin_postgres
```

### 5.3 Restart Docker Services

```powershell
docker compose restart
```

Restart backend only:

```powershell
docker compose restart app
```

### 5.4 Stop Docker Services

```powershell
docker compose down
```

### 5.5 Rebuild Backend Image

```powershell
docker compose build app
docker compose up -d app
```

---

## 6. Admin Frontend Setup And Run

### 6.1 Open Admin Frontend Folder

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
```

### 6.2 Install Dependencies

```powershell
npm install
```

### 6.3 Check API URL

Open:

```powershell
notepad ".env.local"
```

It should contain:

```env
NEXT_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
```

### 6.4 Run Admin Frontend In Development

```powershell
npm run dev
```

Admin panel should open on:

```text
http://192.168.29.8:3000
```

If it opens on localhost, use:

```text
http://localhost:3000
```

### 6.5 Admin Frontend Production Build

Build:

```powershell
npm run build
```

Start production build:

```powershell
npm run start
```

### 6.6 Admin Frontend Lint

```powershell
npm run lint
```

---

## 7. App Frontend Setup And Run

### 7.1 Open App Folder

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
```

### 7.2 Install Dependencies

```powershell
npm install
```

### 7.3 Check API URL

Open:

```powershell
notepad ".env"
```

It should contain:

```env
EXPO_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
```

Important: if testing on a physical phone, the phone and laptop must be on the same Wi-Fi network, and the backend IP `192.168.29.8` must be reachable from the phone.

### 7.4 Run Expo App

```powershell
npm run start
```

Then choose:

- Press `a` for Android emulator/device
- Scan QR code with Expo Go for physical phone
- Press `w` for web if supported

### 7.5 Run Android Native Build

Use this when you need a native Android run:

```powershell
npm run android
```

### 7.6 Run iOS

This usually requires macOS:

```powershell
npm run ios
```

### 7.7 Run Web

```powershell
npm run web
```

### 7.8 App Lint And Format

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

Check format:

```powershell
npm run format:check
```

---

## 8. Run Everything Together For Local Testing

Open three separate PowerShell terminals.

### Terminal 1: Database + Backend

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
docker compose up -d postgres
npm run start:dev
```

### Terminal 2: Admin Frontend

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
npm run dev
```

### Terminal 3: App Frontend

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
npm run start
```

Testing URLs:

```text
Backend: http://192.168.29.8:3001/api/v1
Admin:   http://192.168.29.8:3000
App:     Expo QR / Android / Web
```

---

## 9. Production Readiness Commands

Run these before deployment.

### Backend

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
npm run lint
npm run build
npm run test
```

### Admin Frontend

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
npm run lint
npm run build
```

### App Frontend

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
npm run lint
npm run format:check
```

---

## 10. Common Troubleshooting

### Backend Cannot Connect To Database

Check Docker database:

```powershell
docker ps
docker logs srv_admin_postgres
```

Check backend `.env`:

```env
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=4268
DB_DATABASE=srv_admin
DATABASE_URL=postgresql://postgres:4268@localhost:5433/srv_admin
```

### Admin Or App Cannot Call Backend

Check backend is running:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
npm run start:dev
```

Check frontend env files:

```env
NEXT_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
EXPO_PUBLIC_API_URL=http://192.168.29.8:3001/api/v1
```

If your laptop IP changes, update both frontend env files and backend `SERVER_HOST`.

### Port Already In Use

Find process using a port:

```powershell
netstat -ano | findstr :3001
netstat -ano | findstr :3000
```

Kill process by PID:

```powershell
taskkill /PID YOUR_PID /F
```

### Expo App On Phone Cannot Connect

Check:

- Phone and laptop are on same Wi-Fi
- Backend is running
- Windows Firewall allows Node.js
- `EXPO_PUBLIC_API_URL` uses laptop LAN IP, not `localhost`

---

## 11. Quick Command Summary

Backend:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
docker compose up -d postgres
npm run start:dev
```

Admin frontend:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-FRONTEND"
npm run dev
```

App frontend:

```powershell
cd "C:\Users\dell\Desktop\NEW APP"
npm run start
```

Full Docker backend:

```powershell
cd "C:\Users\dell\Desktop\ADMIN-BACKEND"
docker compose up -d --build
```
