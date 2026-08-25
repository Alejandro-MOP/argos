import dotenv from 'dotenv';
import { createPostgresPool } from './postgres';
import { runMigrations } from './migrations';

dotenv.config();

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const pool = createPostgresPool(databaseUrl);

  try {
    const result = await runMigrations(pool);
    console.log(
      `Migraciones completadas. applied=${result.applied.length} skipped=${result.skipped.length}`,
    );

    for (const migration of result.applied) {
      console.log(`applied ${migration}`);
    }
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
});
