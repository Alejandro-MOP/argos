import { createPostgresPool, hasDatabaseUrl } from '../db/postgres';
import type { Queryable } from '../db/postgres';
import type { EngineConfigRepository } from '../ports/EngineConfigRepository';
import type { EvidenceSignalEvaluationRepository } from '../ports/EvidenceSignalEvaluationRepository';
import type { EvidenceSignalRepository } from '../ports/EvidenceSignalRepository';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { MarketSymbolRepository } from '../ports/MarketSymbolRepository';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { OrbFvgSignalRepository } from '../ports/OrbFvgSignalRepository';
import type { PaperTradeRepository } from '../ports/PaperTradeRepository';
import type { SignalRepository as SignalRepositoryPort } from '../ports/SignalRepository';
import type { SignalEvaluationRepository } from '../ports/SignalEvaluationRepository';
import { MemoryEngineConfigRepository } from '../repositories/MemoryEngineConfigRepository';
import { MemoryEvidenceSignalEvaluationRepository } from '../repositories/MemoryEvidenceSignalEvaluationRepository';
import { MemoryEvidenceSignalRepository } from '../repositories/MemoryEvidenceSignalRepository';
import { MemoryForwardSignalRepository } from '../repositories/MemoryForwardSignalRepository';
import { MemoryMarketSymbolRepository } from '../repositories/MemoryMarketSymbolRepository';
import { MemorySignalEvaluationRepository } from '../repositories/MemorySignalEvaluationRepository';
import { OpportunityMemoryRepository } from '../repositories/OpportunityMemoryRepository';
import { OrbFvgMemoryRepository } from '../repositories/OrbFvgMemoryRepository';
import { PaperTradeMemoryRepository } from '../repositories/PaperTradeMemoryRepository';
import { PostgresEngineConfigRepository } from '../repositories/PostgresEngineConfigRepository';
import { PostgresEvidenceSignalEvaluationRepository } from '../repositories/PostgresEvidenceSignalEvaluationRepository';
import { PostgresEvidenceSignalRepository } from '../repositories/PostgresEvidenceSignalRepository';
import { PostgresMarketSymbolRepository } from '../repositories/PostgresMarketSymbolRepository';
import { PostgresOpportunityRepository } from '../repositories/PostgresOpportunityRepository';
import { PostgresOrbFvgSignalRepository } from '../repositories/PostgresOrbFvgSignalRepository';
import { PostgresPaperTradeRepository } from '../repositories/PostgresPaperTradeRepository';
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
  evidenceSignalRepository: EvidenceSignalRepository;
  evidenceSignalEvaluationRepository: EvidenceSignalEvaluationRepository;
  paperTradeRepository: PaperTradeRepository;
  orbFvgSignalRepository: OrbFvgSignalRepository;
  database?: Queryable;
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
      evidenceSignalRepository: new MemoryEvidenceSignalRepository(),
      evidenceSignalEvaluationRepository: new MemoryEvidenceSignalEvaluationRepository(),
      paperTradeRepository: new PaperTradeMemoryRepository(),
      orbFvgSignalRepository: new OrbFvgMemoryRepository(),
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
    evidenceSignalRepository: new PostgresEvidenceSignalRepository(postgresPool),
    evidenceSignalEvaluationRepository: new PostgresEvidenceSignalEvaluationRepository(postgresPool),
    paperTradeRepository: new PostgresPaperTradeRepository(postgresPool),
    orbFvgSignalRepository: new PostgresOrbFvgSignalRepository(postgresPool),
    database: postgresPool,
  };
};
