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
  const evaluator = new EvidenceSignalEvaluator({
    evidenceSignalRepository: {
      findPending: jest.fn().mockResolvedValue([baseSignal()]),
      saveIfNotDuplicate: jest.fn(),
    },
    evidenceSignalEvaluationRepository: evaluationRepository,
    marketDataService: {
      getCandles: jest.fn(),
      getHistoricalCandles: jest.fn().mockResolvedValue(candles),
    },
    now: () => now,
    expirationWindows: { '15m': 1 },
  });

  return { evaluator, evaluationRepository };
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
});
