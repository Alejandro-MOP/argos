import type { Candle } from '../src/models/Candle';
import type { PersistedForwardSignalSnapshot, SignalEvaluationSnapshot } from '../src/models/ForwardSignal';
import type { ForwardSignalRepository } from '../src/ports/ForwardSignalRepository';
import type { SignalEvaluationRepository } from '../src/ports/SignalEvaluationRepository';
import {
  ForwardSignalEvaluator,
  resolveForwardEvaluationTimeframes,
} from '../src/services/ForwardSignalEvaluator';

const baseTime = new Date('2026-08-20T12:00:00.000Z');
const day = 86_400_000;

const atMinutes = (minutes: number): Date => new Date(baseTime.getTime() + minutes * 60_000);

const candle = (minutes: number, high = 100.5, low = 99.5): Candle => ({
  timestamp: atMinutes(minutes),
  open: 100,
  high,
  low,
  close: 100,
  volume: 1_000,
});

const buildSignal = (overrides: Partial<PersistedForwardSignalSnapshot> = {}): PersistedForwardSignalSnapshot => ({
  id: 'signal-1',
  ticker: 'UBER',
  timeframe: '1d',
  signalType: 'LONG',
  signalAt: baseTime,
  score: 90,
  trendScore: 25,
  volumeScore: 25,
  momentumScore: 20,
  structureScore: 20,
  entry: 100,
  technicalStopPrice: 98,
  financialStopPercent: 1,
  financialStopPrice: 99,
  tp1Percent: 2,
  tp1Price: 102,
  tp2Percent: 5,
  tp2Price: 105,
  telegramSent: true,
  ...overrides,
});

const buildDependencies = (signals: PersistedForwardSignalSnapshot[], candles: Candle[]) => {
  const forwardSignalRepository: ForwardSignalRepository = {
    save: jest.fn(),
    findPending: jest.fn().mockResolvedValue(signals),
  };
  const evaluations = new Map<string, SignalEvaluationSnapshot>();
  const signalEvaluationRepository: SignalEvaluationRepository = {
    findBySignalId: jest.fn(async (signalId: string) => evaluations.get(signalId)),
    upsert: jest.fn(async (evaluation: SignalEvaluationSnapshot) => {
      evaluations.set(evaluation.signalId, evaluation);
    }),
  };
  const marketDataService = {
    getCandles: jest.fn(),
    getHistoricalCandles: jest.fn().mockResolvedValue(candles),
  };
  const rateLimiterService = { wait: jest.fn().mockResolvedValue(undefined) };

  return {
    forwardSignalRepository,
    signalEvaluationRepository,
    marketDataService,
    rateLimiterService,
    evaluations,
  };
};

describe('ForwardSignalEvaluator', () => {
  it('keeps a signal OPEN when no target resolves and it has not expired', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 101, 99.5)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    const result = await evaluator.execute();

    expect(result.open).toBe(1);
    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ signalId: 'signal-1', status: 'OPEN' }),
    );
    expect(deps.evaluations.get('signal-1')?.outcomeTp1).toBeUndefined();
    expect(deps.evaluations.get('signal-1')?.outcomeTp2).toBeUndefined();
  });

  it('marks PARTIALLY_RESOLVED when TP1 wins and TP2 is still pending', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 102.2, 100), candle(30, 104, 100)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'PARTIALLY_RESOLVED', outcomeTp1: 'WIN' }),
    );
    expect(deps.evaluations.get('signal-1')?.outcomeTp2).toBeUndefined();
  });

  it('marks CLOSED when TP1 and TP2 win', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 102.2, 100), candle(30, 105.2, 100)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'CLOSED', outcomeTp1: 'WIN', outcomeTp2: 'WIN' }),
    );
  });

  it('marks CLOSED when stop loss resolves both targets as LOSS', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 101, 98.9)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'CLOSED', outcomeTp1: 'LOSS', outcomeTp2: 'LOSS' }),
    );
  });

  it('marks EXPIRED only after expiresAt when unresolved targets remain', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 101, 99.5)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + 46 * day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'EXPIRED', outcomeTp1: 'EXPIRED', outcomeTp2: 'EXPIRED' }),
    );
  });

  it('marks AMBIGUOUS when one OHLC candle touches stop and target', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 105.5, 98.5)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'AMBIGUOUS', outcomeTp1: 'AMBIGUOUS', outcomeTp2: 'AMBIGUOUS' }),
    );
  });

  it('supports TP1 WIN plus TP2 LOSS', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 102.2, 100), candle(30, 103, 98.9)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'CLOSED', outcomeTp1: 'WIN', outcomeTp2: 'LOSS' }),
    );
  });

  it('supports TP1 WIN plus TP2 EXPIRED', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 102.2, 100), candle(30, 104, 100)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + 46 * day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({ status: 'EXPIRED', outcomeTp1: 'WIN', outcomeTp2: 'EXPIRED' }),
    );
  });

  it('stores MFE, MAE and evaluatedUntil using the last processed candle', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 102.2, 99.5), candle(30, 104, 98.8)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')).toEqual(
      expect.objectContaining({
        maxFavorableExcursionPercent: 4,
        maxAdverseExcursionPercent: -1.2,
        evaluatedUntil: atMinutes(30),
      }),
    );
  });

  it('uses only candles with timestamp greater than signalAt', async () => {
    const deps = buildDependencies(
      [buildSignal()],
      [candle(-15, 106, 98), candle(0, 106, 98), candle(15, 101, 99.5)],
    );
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();

    expect(deps.evaluations.get('signal-1')?.status).toBe('OPEN');
  });

  it('upserts by signal id so repeated runs are idempotent at repository level', async () => {
    const deps = buildDependencies([buildSignal()], [candle(15, 102.2, 100)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    await evaluator.execute();
    await evaluator.execute();

    expect(deps.evaluations.size).toBe(1);
    expect(deps.signalEvaluationRepository.upsert).toHaveBeenCalledTimes(2);
  });

  it('continues evaluating other signals when one signal fails', async () => {
    const failingSignal = buildSignal({ id: 'bad', ticker: 'BAD' });
    const okSignal = buildSignal({ id: 'ok', ticker: 'OK' });
    const deps = buildDependencies([failingSignal, okSignal], [candle(15, 102.2, 100)]);
    deps.marketDataService.getHistoricalCandles.mockImplementation(async (ticker: string) => {
      if (ticker === 'BAD') {
        throw new Error('Yahoo error');
      }

      return [candle(15, 102.2, 100)];
    });
    const logger = { log: jest.fn(), error: jest.fn() };
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    const result = await evaluator.execute({}, logger);

    expect(result.errors).toBe(1);
    expect(result.evaluated).toBe(1);
    expect(deps.evaluations.get('ok')?.status).toBe('PARTIALLY_RESOLVED');
    expect(logger.error).toHaveBeenCalledWith(
      'No se pudo evaluar señal forward BAD',
      expect.objectContaining({ signalId: 'bad', ticker: 'BAD', message: expect.stringContaining('Yahoo error') }),
    );
  });

  it('falls back to the next evaluation timeframe when preferred data is unavailable', async () => {
    const deps = buildDependencies([buildSignal({ timeframe: '1d' })], []);
    deps.marketDataService.getHistoricalCandles
      .mockRejectedValueOnce(new Error('not enough 15m'))
      .mockResolvedValueOnce([candle(15, 102.2, 100)]);
    const evaluator = new ForwardSignalEvaluator({ ...deps, now: () => new Date(baseTime.getTime() + day) });

    const result = await evaluator.execute();

    expect(deps.marketDataService.getHistoricalCandles).toHaveBeenNthCalledWith(
      1,
      'UBER',
      '15m',
      baseTime,
      expect.any(Date),
    );
    expect(deps.marketDataService.getHistoricalCandles).toHaveBeenNthCalledWith(
      2,
      'UBER',
      '30m',
      baseTime,
      expect.any(Date),
    );
    expect(result.items[0]).toEqual(expect.objectContaining({ evaluationTimeframe: '30m' }));
  });

  it('passes signalId and ticker filters to the pending signal query', async () => {
    const deps = buildDependencies([], []);
    const evaluator = new ForwardSignalEvaluator({ ...deps });

    await evaluator.execute({ signalId: 'abc', ticker: 'uber', limit: 5 });

    expect(deps.forwardSignalRepository.findPending).toHaveBeenCalledWith({
      signalId: 'abc',
      ticker: 'uber',
      limit: 5,
    });
  });

  it('documents the default follow-up timeframe strategy', () => {
    expect(resolveForwardEvaluationTimeframes('1m')[0]).toBe('1m');
    expect(resolveForwardEvaluationTimeframes('30m')[0]).toBe('15m');
    expect(resolveForwardEvaluationTimeframes('1h')[0]).toBe('15m');
    expect(resolveForwardEvaluationTimeframes('1d')[0]).toBe('15m');
    expect(resolveForwardEvaluationTimeframes('1w')[0]).toBe('1d');
  });
});
