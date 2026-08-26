import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export const DATABASE_SCHEMA = 'market_signal_engine';

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export const createPostgresPool = (databaseUrl: string): Pool => {
  const config: PoolConfig = {
    connectionString: databaseUrl,
    options: `-c search_path=${DATABASE_SCHEMA},public`,
  };

  return new Pool(config);
};

export const hasDatabaseUrl = (databaseUrl: string | undefined): boolean =>
  Boolean(databaseUrl?.trim());
