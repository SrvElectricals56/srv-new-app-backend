const TRUE_VALUES = new Set(['true', '1', 'yes']);

function isTrue(value: unknown): boolean {
  return TRUE_VALUES.has(String(value ?? '').trim().toLowerCase());
}

function requireValue(config: Record<string, unknown>, key: string): string {
  const value = String(config[key] ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requireStrongSecret(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = requireValue(config, key);
  if (value.length < 32) {
    throw new Error(`${key} must contain at least 32 characters`);
  }
  return value;
}

function validateInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): void {
  const rawValue = String(config[key] ?? fallback);
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const config = { ...input };
  const appEnvironment = String(
    config.APP_ENV ?? config.NODE_ENV ?? 'development',
  )
    .trim()
    .toLowerCase();

  if (!['development', 'test', 'staging', 'production'].includes(appEnvironment)) {
    throw new Error(
      'APP_ENV must be one of development, test, staging, or production',
    );
  }
  config.APP_ENV = appEnvironment;

  validateInteger(config, 'PORT', 3001, 1, 65535);
  validateInteger(config, 'TRUST_PROXY_HOPS', 0, 0, 10);
  validateInteger(config, 'DB_POOL_MIN', 2, 0, 100);
  validateInteger(config, 'DB_POOL_MAX', 20, 1, 100);
  validateInteger(config, 'DB_CONNECTION_TIMEOUT_MS', 5000, 100, 120000);
  validateInteger(config, 'DB_QUERY_TIMEOUT_MS', 30000, 100, 300000);
  validateInteger(config, 'DB_STATEMENT_TIMEOUT_MS', 30000, 100, 300000);
  validateInteger(config, 'DB_IDLE_TRANSACTION_TIMEOUT_MS', 30000, 1000, 300000);

  const poolMin = Number(config.DB_POOL_MIN ?? 2);
  const poolMax = Number(config.DB_POOL_MAX ?? 20);
  if (poolMin > poolMax) {
    throw new Error('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  }

  if (appEnvironment !== 'production') return config;

  const databasePassword = requireStrongSecret(config, 'DB_PASSWORD');
  const jwtSecret = requireStrongSecret(config, 'JWT_SECRET');
  const refreshSecret = requireStrongSecret(config, 'JWT_REFRESH_SECRET');

  if (jwtSecret === refreshSecret || databasePassword === jwtSecret) {
    throw new Error('Database, access-token, and refresh-token secrets must be unique');
  }
  if (isTrue(config.DB_SYNCHRONIZE)) {
    throw new Error('DB_SYNCHRONIZE must be false in production');
  }
  if (!isTrue(config.DB_SSL) || !isTrue(config.DB_SSL_REJECT_UNAUTHORIZED)) {
    throw new Error(
      'Production PostgreSQL must use certificate-verified TLS (DB_SSL=true and DB_SSL_REJECT_UNAUTHORIZED=true)',
    );
  }
  if (isTrue(config.OTP_TEST_MODE)) {
    throw new Error('OTP_TEST_MODE must be false in production');
  }
  if (isTrue(config.SWAGGER_ENABLED)) {
    throw new Error('SWAGGER_ENABLED must be false in production');
  }

  const databaseUser = requireValue(config, 'DB_USERNAME').toLowerCase();
  if (['postgres', 'doadmin', 'root'].includes(databaseUser)) {
    throw new Error('Production API must use a restricted, non-owner database role');
  }

  const corsOrigins = requireValue(config, 'CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes('*')) {
    throw new Error('Wildcard CORS is forbidden in production');
  }
  for (const origin of corsOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    if (url.protocol !== 'https:' || url.origin !== origin) {
      throw new Error(
        `Production CORS origins must be exact HTTPS origins without paths: ${origin}`,
      );
    }
  }

  return config;
}
