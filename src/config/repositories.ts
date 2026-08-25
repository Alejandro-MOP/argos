import { createPostgresPool, hasDatabaseUrl } from '../db/postgres';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { SignalRepository as SignalRepositoryPort } from '../ports/SignalRepository';
import { MemoryForwardSignalRepository } from '../repositories/MemoryForwardSignalRepository';
import { OpportunityMemoryRepository } from '../repositories/OpportunityMemoryRepository';
import { PostgresOpportunityRepository } from '../repositories/PostgresOpportunityRepository';
import { PostgresSignalRepository } from '../repositories/PostgresSignalRepository';
import { SignalRepository } from '../repositories/SignalRepository';

export interface RepositorySet {
  opportunityRepository: OpportunityRepository;
  signalRepository: SignalRepositoryPort;
  forwardSignalRepository: ForwardSignalRepository;
}

export const createRepositories = (databaseUrl: string): RepositorySet => {
  const signalRepository = new SignalRepository();

  if (!hasDatabaseUrl(databaseUrl)) {
    return {
      opportunityRepository: new OpportunityMemoryRepository(),
      signalRepository,
      forwardSignalRepository: new MemoryForwardSignalRepository(),
    };
  }

  const postgresPool = createPostgresPool(databaseUrl);

  return {
    opportunityRepository: new PostgresOpportunityRepository(postgresPool),
    signalRepository,
    forwardSignalRepository: new PostgresSignalRepository(postgresPool),
  };
};
