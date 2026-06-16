# Server
NODE_ENV=development
PORT=3001
SERVER_HOST=10.112.103.231

# Database (Docker PostgreSQL)
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=4268
DB_DATABASE=srv_admin
DB_SYNCHRONIZE=false
DB_LOGGING=false

# Prisma requires this
DATABASE_URL=postgresql://postgres:4268@localhost:5433/srv_admin

# JWT
JWT_SECRET=srv-admin-secret-key-2024
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=srv-admin-refresh-secret-2024
JWT_REFRESH_EXPIRES_IN=30d

# CORS
CORS_ORIGIN=http://localhost:3000,http://10.112.103.231:8081,http://10.112.103.231:19000,http://10.112.103.231:19006,http://10.112.103.231:8082,http://10.112.103.231:19001,http://10.112.103.231:19002
CORS_CREDENTIALS=true

# API
API_PREFIX=api/v1

# Rate Limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=100
