import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export const createPostgresPool = (databaseUrl: string): Pool => {
  const config: PoolConfig = {
    connectionString: databaseUrl,
  };

  return new Pool(config);
};

export const hasDatabaseUrl = (databaseUrl: string | undefined): boolean =>
  Boolean(databaseUrl?.trim());
