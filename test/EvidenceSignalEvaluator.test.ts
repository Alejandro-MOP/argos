import type { Candle } from '../src/models/Candle';
import type { PersistedEvidenceSignalSnapshot } from '../src/models/EvidenceSignal';
import { EvidenceSignalEvaluator } from '../src/services/EvidenceSignalEvaluator';

const baseSignal = (overrides: Partial<PersistedEvidenceSignalSnapshot> = {}): PersistedEvidenceSignalSnapshot => ({
  id: 'evidence-1',
  ticker: 'NVDA',
  providerSymbol: 'NVDA',
  timeframe: '15m',
  detectedAt: new Date('2026-01-01T14:00:00.000Z'),
  signalType: 'LONG',
  score: 85,
  trendScore: 25,
  volumeScore: 25,
  momentumScore: 20,
  structureScore: 15,
  reasons: [],
  entry: 100,
  technicalStopPrice: 98,
  financialStopPercent: 1,
  financialStopPrice: 99,
  tp1Percent: 2,
  tp1Price: 102,
  tp2Percent: 3,
  tp2Price: 103,
  strategyVersion: 'v1',
  assetType: 'STOCK',
  sector: 'Technology',
  industry: 'Semiconductors',
  market: 'US',
  isOperationalOpportunity: false,
  createdAt: new Date('2026-01-01T14:00:00.000Z'),
  ...overrides,
});

const candle = (timestamp: string, high: number, low: number): Candle => ({
  timestamp: new Date(timestamp),
  open: 100,
  high,
  low,
  close: 100,
  volume: 1_000,
});

const buildEvaluator = (candles: Candle[], now: Date) => {
  const evaluationRepository = {
    upsert: jest.fn(),
    upsertTargetEvaluations: jest.fn(),
  };
  const marketDataService = {
    getCandles: jest.fn(),
    getHistoricalCandles: jest.fn().mockResolvedValue(candles),
  };
  const evaluator = new EvidenceSignalEvaluator({
    evidenceSignalRepository: {
      findPending: jest.fn().mockResolvedValue([baseSignal()]),
      saveIfNotDuplicate: jest.fn(),
    },
    evidenceSignalEvaluationRepository: evaluationRepository,
    marketDataService,
    now: () => now,
    expirationWindows: { '15m': 1 },
  });

  return { evaluator, evaluationRepository, marketDataService };
};

describe('EvidenceSignalEvaluator', () => {
  it('keeps unresolved Evidence as OPEN before expiration', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [candle('2026-01-01T15:00:00.000Z', 100.5, 99.5)],
      new Date('2026-01-01T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(result.open).toBe(1);
    expect(evaluationRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'OPEN', outcomeTp1: undefined, outcomeTp2: undefined }),
    );
  });

  it('marks Evidence as PARTIALLY_RESOLVED when only TP1 wins', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [candle('2026-01-01T15:00:00.000Z', 102.5, 99.5)],
      new Date('2026-01-01T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(result.partial).toBe(1);
    expect(evaluationRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PARTIALLY_RESOLVED', outcomeTp1: 'WIN', outcomeTp2: undefined }),
    );
  });

  it('marks Evidence as CLOSED when TP1 and TP2 resolve', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [candle('2026-01-01T15:00:00.000Z', 103.5, 99.5)],
      new Date('2026-01-01T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(result.closed).toBe(1);
    expect(evaluationRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CLOSED', outcomeTp1: 'WIN', outcomeTp2: 'WIN' }),
    );
  });

  it('marks Evidence as EXPIRED after expiration with no hits', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [candle('2026-01-01T15:00:00.000Z', 100.5, 99.5)],
      new Date('2026-01-03T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(result.expired).toBe(1);
    expect(evaluationRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED', outcomeTp1: 'EXPIRED', outcomeTp2: 'EXPIRED' }),
    );
  });

  it('marks Evidence as AMBIGUOUS when stop and target are touched in the same candle', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [candle('2026-01-01T15:00:00.000Z', 102.5, 98.5)],
      new Date('2026-01-01T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(result.ambiguous).toBe(1);
    expect(evaluationRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'AMBIGUOUS', outcomeTp1: 'AMBIGUOUS' }),
    );
  });

  it('evaluates experimental target ladder against the current financial stop and records MFE/MAE', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [
        candle('2026-01-01T15:00:00.000Z', 101.25, 99.5),
        candle('2026-01-01T16:00:00.000Z', 101.3, 98.5),
      ],
      new Date('2026-01-03T16:00:00.000Z'),
    );

    await evaluator.execute();

    expect(evaluationRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        maxFavorableExcursionPercent: 1.3,
        maxAdverseExcursionPercent: -1.5,
      }),
    );
    expect(evaluationRepository.upsertTargetEvaluations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ targetPercent: 0.5, outcome: 'WIN' }),
        expect.objectContaining({ targetPercent: 0.75, outcome: 'WIN' }),
        expect.objectContaining({ targetPercent: 1, outcome: 'WIN' }),
        expect.objectContaining({ targetPercent: 1.25, outcome: 'WIN' }),
        expect.objectContaining({ targetPercent: 1.5, outcome: 'LOSS' }),
        expect.objectContaining({ targetPercent: 2, outcome: 'LOSS' }),
        expect.objectContaining({ targetPercent: 3, outcome: 'LOSS' }),
        expect.objectContaining({ targetPercent: 5, outcome: 'LOSS' }),
      ]),
    );
  });

  it('keeps Evidence pending without creating an evaluation when no future candles exist', async () => {
    const { evaluator, evaluationRepository } = buildEvaluator(
      [candle('2026-01-01T13:45:00.000Z', 103, 98), candle('2026-01-01T14:00:00.000Z', 103, 98)],
      new Date('2026-01-01T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(result.evaluated).toBe(0);
    expect(result.pendingNoFutureCandles).toBe(1);
    expect(result.providerErrors).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.items[0]).toEqual(expect.objectContaining({ pendingReason: 'no-future-candles-yet' }));
    expect(evaluationRepository.upsert).not.toHaveBeenCalled();
    expect(evaluationRepository.upsertTargetEvaluations).not.toHaveBeenCalled();
  });

  it('evaluates Evidence with available future candles even when fewer than analyzer history is available', async () => {
    const candles = Array.from({ length: 13 }, (_, index) =>
      candle(new Date(Date.UTC(2026, 0, 1, 14, index + 1)).toISOString(), 100.5, 99.5),
    );
    const { evaluator, evaluationRepository, marketDataService } = buildEvaluator(
      candles,
      new Date('2026-01-01T16:00:00.000Z'),
    );

    const result = await evaluator.execute();

    expect(marketDataService.getHistoricalCandles).toHaveBeenCalledWith(
      'NVDA',
      '15m',
      new Date('2026-01-01T14:00:00.000Z'),
      expect.any(Date),
      { minimumCandles: 0 },
    );
    expect(result.evaluated).toBe(1);
    expect(result.pendingNoFutureCandles).toBe(0);
    expect(evaluationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN' }));
  });

  it('uses fallback timeframe when preferred Evidence candles are raw but not future candles', async () => {
    const evaluationRepository = {
      upsert: jest.fn(),
      upsertTargetEvaluations: jest.fn(),
    };
    const marketDataService = {
      getCandles: jest.fn(),
      getHistoricalCandles: jest
        .fn()
        .mockResolvedValueOnce([candle('2026-01-01T13:55:00.000Z', 103, 98)])
        .mockResolvedValueOnce([candle('2026-01-01T14:05:00.000Z', 100.5, 99.5)]),
    };
    const evaluator = new EvidenceSignalEvaluator({
      evidenceSignalRepository: {
        findPending: jest.fn().mockResolvedValue([baseSignal({ timeframe: '1m' })]),
        saveIfNotDuplicate: jest.fn(),
      },
      evidenceSignalEvaluationRepository: evaluationRepository,
      marketDataService,
      now: () => new Date('2026-01-01T16:00:00.000Z'),
      expirationWindows: { '1m': 1 },
    });

    const result = await evaluator.execute();

    expect(marketDataService.getHistoricalCandles).toHaveBeenCalledTimes(2);
    expect(result.items[0]).toEqual(expect.objectContaining({ evaluationTimeframe: '5m', status: 'OPEN' }));
  });

  it('counts Evidence provider failures separately from no-future pending states', async () => {
    const { evaluator, marketDataService } = buildEvaluator([], new Date('2026-01-01T16:00:00.000Z'));
    marketDataService.getHistoricalCandles.mockRejectedValue(new Error('Yahoo timeout'));

    const result = await evaluator.execute();

    expect(result.providerErrors).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.pendingNoFutureCandles).toBe(0);
  });
});
