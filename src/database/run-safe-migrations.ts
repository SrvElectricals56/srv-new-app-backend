import AppDataSource from './data-source';

const INITIAL_MIGRATION_TIMESTAMP = 1700000000000;
const INITIAL_MIGRATION_NAME = 'InitialSchema1700000000000';
const MIGRATION_LOCK_KEY = 728194633;

async function run(): Promise<void> {
  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();

  try {
    await runner.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    const [{ hasLegacySchema, hasMigrationTable }] = await runner.query(`
      SELECT (
        to_regclass('public.admins') IS NOT NULL
        AND to_regclass('public.products') IS NOT NULL
      ) AS "hasLegacySchema",
      (to_regclass('public.migrations') IS NOT NULL) AS "hasMigrationTable"
    `);

    if (!hasMigrationTable) {
      await runner.query(`
        CREATE TABLE "migrations" (
          "id" SERIAL NOT NULL,
          "timestamp" bigint NOT NULL,
          "name" character varying NOT NULL,
          CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
        )
      `);
    }

    if (hasLegacySchema) {
      await runner.query(`
        INSERT INTO "migrations" ("timestamp", "name")
        SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1 FROM "migrations" WHERE "timestamp" = $1
        )
      `, [INITIAL_MIGRATION_TIMESTAMP, INITIAL_MIGRATION_NAME]);
    }

    const migrations = await AppDataSource.runMigrations({ transaction: 'all' });
    console.log(`Database migrations ready (${migrations.length} applied).`);
  } finally {
    await runner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    await runner.release();
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('Database migration startup failed:', error);
  process.exitCode = 1;
});
