import type { Opportunity } from '../src/models/Opportunity';
import type { ForwardSignalSnapshot } from '../src/models/ForwardSignal';
import type { Queryable } from '../src/db/postgres';
import { createRepositories } from '../src/config/repositories';
import { MemoryForwardSignalRepository } from '../src/repositories/MemoryForwardSignalRepository';
import { MemorySignalEvaluationRepository } from '../src/repositories/MemorySignalEvaluationRepository';
import { OpportunityMemoryRepository } from '../src/repositories/OpportunityMemoryRepository';
import { PostgresOpportunityRepository } from '../src/repositories/PostgresOpportunityRepository';
import { PostgresSignalEvaluationRepository } from '../src/repositories/PostgresSignalEvaluationRepository';
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
  strategyVersion: 'v1',
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
      snapshot.strategyVersion,
    ]);
  });


  it('finds only pending forward signals and excludes terminal evaluations', async () => {
    const database = buildDatabase();
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          ticker: 'NVDA',
          timeframe: '15m',
          signal_type: 'LONG',
          signal_at: new Date('2026-08-24T12:01:00.000Z'),
          score: '85',
          trend_score: '25',
          volume_score: '20',
          momentum_score: '15',
          structure_score: '25',
          entry: '180',
          technical_stop_price: '177.5',
          financial_stop_percent: '1',
          financial_stop_price: '178.2',
          tp1_percent: '2',
          tp1_price: '183.6',
          tp2_percent: '3',
          tp2_price: '185.4',
          telegram_sent: true,
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });
    const repository = new PostgresSignalRepository(database);

    const signals = await repository.findPending({ ticker: 'nvda', signalId: 'signal-id', limit: 10 });

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("evaluation.status IN ('OPEN', 'PARTIALLY_RESOLVED')"),
      ['signal-id', 'NVDA', 10],
    );
    expect(database.query.mock.calls[0][0]).toContain('LEFT JOIN signal_evaluations');
    expect(signals).toEqual([
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', ticker: 'NVDA' }),
    ]);
  });

  it('upserts signal evaluations by signal_id to keep evaluation idempotent', async () => {
    const database = buildDatabase();
    const repository = new PostgresSignalEvaluationRepository(database);

    await repository.upsert({
      signalId: 'signal-id',
      outcomeTp1: 'WIN',
      outcomeTp2: 'LOSS',
      exitAtTp1: new Date('2026-08-24T12:15:00.000Z'),
      exitAtTp2: new Date('2026-08-24T12:30:00.000Z'),
      candlesUntilTp1: 1,
      candlesUntilTp2: 2,
      maxFavorableExcursionPercent: 2.5,
      maxAdverseExcursionPercent: -1,
      evaluatedUntil: new Date('2026-08-24T12:30:00.000Z'),
      status: 'CLOSED',
    });

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (signal_id) DO UPDATE'), [
      expect.any(String),
      'signal-id',
      'WIN',
      'LOSS',
      new Date('2026-08-24T12:15:00.000Z'),
      new Date('2026-08-24T12:30:00.000Z'),
      1,
      2,
      2.5,
      -1,
      new Date('2026-08-24T12:30:00.000Z'),
      'CLOSED',
    ]);
  });

  it('loads a signal evaluation by signal id', async () => {
    const database = buildDatabase();
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'evaluation-id',
          signal_id: 'signal-id',
          outcome_tp1: 'WIN',
          outcome_tp2: null,
          exit_at_tp1: new Date('2026-08-24T12:15:00.000Z'),
          exit_at_tp2: null,
          candles_until_tp1: 1,
          candles_until_tp2: null,
          max_favorable_excursion_percent: '2.5',
          max_adverse_excursion_percent: '-0.3',
          evaluated_until: new Date('2026-08-24T12:30:00.000Z'),
          status: 'PARTIALLY_RESOLVED',
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });
    const repository = new PostgresSignalEvaluationRepository(database);

    const evaluation = await repository.findBySignalId('signal-id');

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('WHERE signal_id = $1'), [
      'signal-id',
    ]);
    expect(evaluation).toEqual(
      expect.objectContaining({
        id: 'evaluation-id',
        signalId: 'signal-id',
        outcomeTp1: 'WIN',
        outcomeTp2: undefined,
        maxFavorableExcursionPercent: 2.5,
        maxAdverseExcursionPercent: -0.3,
        status: 'PARTIALLY_RESOLVED',
      }),
    );
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
      'legacy',
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
    expect(repositories.signalEvaluationRepository).toBeInstanceOf(MemorySignalEvaluationRepository);
  });

  it('uses PostgreSQL repositories when DATABASE_URL is present', () => {
    const repositories = createRepositories('postgres://user:pass@localhost:5432/db');

    expect(repositories.opportunityRepository).toBeInstanceOf(PostgresOpportunityRepository);
    expect(repositories.forwardSignalRepository).toBeInstanceOf(PostgresSignalRepository);
    expect(repositories.signalEvaluationRepository).toBeInstanceOf(PostgresSignalEvaluationRepository);
  });
});
