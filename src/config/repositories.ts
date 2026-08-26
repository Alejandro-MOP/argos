import { createPostgresPool, hasDatabaseUrl } from '../db/postgres';
import type { EngineConfigRepository } from '../ports/EngineConfigRepository';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { MarketSymbolRepository } from '../ports/MarketSymbolRepository';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { SignalRepository as SignalRepositoryPort } from '../ports/SignalRepository';
import type { SignalEvaluationRepository } from '../ports/SignalEvaluationRepository';
import { MemoryEngineConfigRepository } from '../repositories/MemoryEngineConfigRepository';
import { MemoryForwardSignalRepository } from '../repositories/MemoryForwardSignalRepository';
import { MemoryMarketSymbolRepository } from '../repositories/MemoryMarketSymbolRepository';
import { MemorySignalEvaluationRepository } from '../repositories/MemorySignalEvaluationRepository';
import { OpportunityMemoryRepository } from '../repositories/OpportunityMemoryRepository';
import { PostgresEngineConfigRepository } from '../repositories/PostgresEngineConfigRepository';
import { PostgresMarketSymbolRepository } from '../repositories/PostgresMarketSymbolRepository';
import { PostgresOpportunityRepository } from '../repositories/PostgresOpportunityRepository';
import { PostgresSignalEvaluationRepository } from '../repositories/PostgresSignalEvaluationRepository';
import { PostgresSignalRepository } from '../repositories/PostgresSignalRepository';
import { SignalRepository } from '../repositories/SignalRepository';

export interface RepositorySet {
  opportunityRepository: OpportunityRepository;
  signalRepository: SignalRepositoryPort;
  forwardSignalRepository: ForwardSignalRepository;
  signalEvaluationRepository: SignalEvaluationRepository;
  engineConfigRepository: EngineConfigRepository;
  marketSymbolRepository: MarketSymbolRepository;
}

export const createRepositories = (databaseUrl: string): RepositorySet => {
  const signalRepository = new SignalRepository();

  if (!hasDatabaseUrl(databaseUrl)) {
    return {
      opportunityRepository: new OpportunityMemoryRepository(),
      signalRepository,
      forwardSignalRepository: new MemoryForwardSignalRepository(),
      signalEvaluationRepository: new MemorySignalEvaluationRepository(),
      engineConfigRepository: new MemoryEngineConfigRepository(),
      marketSymbolRepository: new MemoryMarketSymbolRepository(),
    };
  }

  const postgresPool = createPostgresPool(databaseUrl);

  return {
    opportunityRepository: new PostgresOpportunityRepository(postgresPool),
    signalRepository,
    forwardSignalRepository: new PostgresSignalRepository(postgresPool),
    signalEvaluationRepository: new PostgresSignalEvaluationRepository(postgresPool),
    engineConfigRepository: new PostgresEngineConfigRepository(postgresPool),
    marketSymbolRepository: new PostgresMarketSymbolRepository(postgresPool),
  };
};
