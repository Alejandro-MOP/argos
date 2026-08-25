import type { Opportunity } from '../src/models/Opportunity';
import type { ForwardSignalSnapshot } from '../src/models/ForwardSignal';
import type { Queryable } from '../src/db/postgres';
import { createRepositories } from '../src/config/repositories';
import { MemoryForwardSignalRepository } from '../src/repositories/MemoryForwardSignalRepository';
import { OpportunityMemoryRepository } from '../src/repositories/OpportunityMemoryRepository';
import { PostgresOpportunityRepository } from '../src/repositories/PostgresOpportunityRepository';
import { PostgresSignalRepository } from '../src/repositories/PostgresSignalRepository';

const buildDatabase = (): Queryable & { query: jest.Mock } => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }),
});

const buildOpportunity = (): Opportunity => ({
  ticker: 'NVDA',
  timeframe: '15m',
  score: 85,
  trendScore: 25,
  volumeScore: 20,
  momentumScore: 15,
  structureScore: 25,
  reasons: ['Breakout confirmado'],
  detectedAt: new Date('2026-08-24T12:00:00.000Z'),
});

const buildForwardSignal = (): ForwardSignalSnapshot => ({
  id: '11111111-1111-4111-8111-111111111111',
  ticker: 'NVDA',
  timeframe: '15m',
  signalType: 'LONG',
  signalAt: new Date('2026-08-24T12:01:00.000Z'),
  score: 85,
  trendScore: 25,
  volumeScore: 20,
  momentumScore: 15,
  structureScore: 25,
  entry: 180,
  technicalStopPrice: 177.5,
  financialStopPercent: 1,
  financialStopPrice: 178.2,
  tp1Percent: 2,
  tp1Price: 183.6,
  tp2Percent: 3,
  tp2Price: 185.4,
  telegramSent: true,
});

describe('Postgres repositories', () => {
  it('persists a complete forward Signal snapshot', async () => {
    const database = buildDatabase();
    const repository = new PostgresSignalRepository(database);
    const snapshot = buildForwardSignal();

    await repository.save(snapshot);

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO signals'), [
      snapshot.id,
      snapshot.ticker,
      snapshot.timeframe,
      snapshot.signalType,
      snapshot.signalAt,
      snapshot.score,
      snapshot.trendScore,
      snapshot.volumeScore,
      snapshot.momentumScore,
      snapshot.structureScore,
      snapshot.entry,
      snapshot.technicalStopPrice,
      snapshot.financialStopPercent,
      snapshot.financialStopPrice,
      snapshot.tp1Percent,
      snapshot.tp1Price,
      snapshot.tp2Percent,
      snapshot.tp2Price,
      snapshot.telegramSent,
    ]);
  });

  it('persists an Opportunity for audit and persistent deduplication', async () => {
    const database = buildDatabase();
    const repository = new PostgresOpportunityRepository(database);
    const opportunity = buildOpportunity();

    await repository.save(opportunity);

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO opportunities'), [
      opportunity.ticker,
      opportunity.timeframe,
      opportunity.detectedAt,
      opportunity.score,
      opportunity.trendScore,
      opportunity.volumeScore,
      opportunity.momentumScore,
      opportunity.structureScore,
      JSON.stringify(opportunity.reasons),
    ]);
  });

  it('uses PostgreSQL findRecentByTicker for persistent duplicate checks', async () => {
    const database = buildDatabase();
    database.query.mockResolvedValueOnce({
      rows: [
        {
          ticker: 'NVDA',
          timeframe: '15m',
          detected_at: new Date('2026-08-24T12:00:00.000Z'),
          score: '85',
          trend_score: '25',
          volume_score: '20',
          momentum_score: '15',
          structure_score: '25',
          reasons: ['Breakout confirmado'],
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });
    const repository = new PostgresOpportunityRepository(database);
    const since = new Date('2026-08-24T11:00:00.000Z');

    const opportunities = await repository.findRecentByTicker('NVDA', '15m', since);

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('WHERE ticker = $1'), [
      'NVDA',
      '15m',
      since,
    ]);
    expect(opportunities).toEqual([
      expect.objectContaining({ ticker: 'NVDA', timeframe: '15m', score: 85 }),
    ]);
  });
});

describe('repository selection', () => {
  it('uses Memory repositories when DATABASE_URL is absent', () => {
    const repositories = createRepositories('');

    expect(repositories.opportunityRepository).toBeInstanceOf(OpportunityMemoryRepository);
    expect(repositories.forwardSignalRepository).toBeInstanceOf(MemoryForwardSignalRepository);
  });

  it('uses PostgreSQL repositories when DATABASE_URL is present', () => {
    const repositories = createRepositories('postgres://user:pass@localhost:5432/db');

    expect(repositories.opportunityRepository).toBeInstanceOf(PostgresOpportunityRepository);
    expect(repositories.forwardSignalRepository).toBeInstanceOf(PostgresSignalRepository);
  });
});
