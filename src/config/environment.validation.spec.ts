import { validateEnvironment } from './environment.validation';

const productionEnvironment = {
  APP_ENV: 'production',
  DB_USERNAME: 'srv_app',
  DB_PASSWORD: 'database-secret-that-is-at-least-32-characters',
  DB_SSL: 'true',
  DB_SSL_REJECT_UNAUTHORIZED: 'true',
  DB_SYNCHRONIZE: 'false',
  JWT_SECRET: 'access-secret-that-is-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-at-least-32-characters',
  OTP_TEST_MODE: 'false',
  SWAGGER_ENABLED: 'false',
  CORS_ORIGIN: 'https://admin.example.com',
};

describe('validateEnvironment', () => {
  it('accepts a hardened production environment', () => {
    expect(validateEnvironment(productionEnvironment)).toMatchObject({
      APP_ENV: 'production',
      DB_USERNAME: 'srv_app',
    });
  });

  it.each([
    ['DB_SYNCHRONIZE', 'true'],
    ['DB_SSL', 'false'],
    ['DB_SSL_REJECT_UNAUTHORIZED', 'false'],
    ['OTP_TEST_MODE', 'true'],
    ['SWAGGER_ENABLED', 'true'],
    ['DB_USERNAME', 'postgres'],
    ['CORS_ORIGIN', '*'],
  ])('rejects unsafe production setting %s=%s', (key, value) => {
    expect(() =>
      validateEnvironment({ ...productionEnvironment, [key]: value }),
    ).toThrow();
  });

  it('rejects reused JWT secrets', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        JWT_REFRESH_SECRET: productionEnvironment.JWT_SECRET,
      }),
    ).toThrow('must be unique');
  });

  it('keeps local development compatible with short local-only credentials', () => {
    expect(
      validateEnvironment({
        APP_ENV: 'development',
        DB_PASSWORD: 'local',
        JWT_SECRET: 'local',
      }),
    ).toMatchObject({ APP_ENV: 'development' });
  });

  it('requires an approved template and valid app hash together', () => {
    expect(() => validateEnvironment({ APP_ENV: 'development', SMS_RETRIEVER_TEMPLATE_ID: 'approved-id' })).toThrow('must be set together');
    expect(() => validateEnvironment({ APP_ENV: 'development', SMS_RETRIEVER_APP_HASH: 'invalid' })).toThrow('must be set together');
    expect(() => validateEnvironment({ APP_ENV: 'development', SMS_RETRIEVER_TEMPLATE_ID: 'approved-id', SMS_RETRIEVER_APP_HASH: 'invalid' })).toThrow('11-character');
    expect(validateEnvironment({ APP_ENV: 'development', SMS_RETRIEVER_TEMPLATE_ID: 'approved-id', SMS_RETRIEVER_APP_HASH: 'FA+9qCX9VSu' })).toMatchObject({ SMS_RETRIEVER_TEMPLATE_ID: 'approved-id' });
  });
});
