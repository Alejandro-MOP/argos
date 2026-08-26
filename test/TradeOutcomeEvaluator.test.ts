import type { Candle } from '../src/models/Candle';
import { TradeOutcomeEvaluator } from '../src/services/TradeOutcomeEvaluator';

const at = (minutes: number): Date => new Date(Date.UTC(2026, 0, 1, 12, minutes, 0, 0));

const candle = (
  minutes: number,
  values: Partial<Pick<Candle, 'open' | 'high' | 'low' | 'close' | 'volume'>> = {},
): Candle => ({
  timestamp: at(minutes),
  open: values.open ?? 100,
  high: values.high ?? 100.5,
  low: values.low ?? 99.5,
  close: values.close ?? 100,
  volume: values.volume ?? 1_000,
});

const buildRequest = (candles: Candle[] = []) => ({
  entry: 100,
  stopLoss: 99,
  takeProfit1: 102,
  takeProfit2: 105,
  signalAt: at(0),
  expiresAt: at(10),
  candles,
});

describe('TradeOutcomeEvaluator', () => {
  const evaluator = new TradeOutcomeEvaluator();

  it('marks TP1 as WIN when TP1 is touched before stop loss', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(1, { high: 101 }), candle(2, { high: 102.1, low: 100 })]),
    );

    expect(result.outcomeTp1).toEqual({
      outcome: 'WIN',
      exitAt: at(2),
      candlesUntil: 2,
      exitIndex: 1,
    });
  });

  it('marks TP2 as WIN when TP2 is touched before stop loss', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(1, { high: 103 }), candle(2, { high: 105.1, low: 101 })]),
    );

    expect(result.outcomeTp2).toEqual({
      outcome: 'WIN',
      exitAt: at(2),
      candlesUntil: 2,
      exitIndex: 1,
    });
  });

  it('marks TP1 as LOSS when stop loss is touched before TP1', () => {
    const result = evaluator.evaluate(buildRequest([candle(1, { high: 101, low: 98.9 })]));

    expect(result.outcomeTp1).toEqual({
      outcome: 'LOSS',
      exitAt: at(1),
      candlesUntil: 1,
      exitIndex: 0,
    });
  });

  it('marks TP2 as LOSS when stop loss is touched before TP2', () => {
    const result = evaluator.evaluate(buildRequest([candle(1, { high: 102.5, low: 100 }), candle(2, { low: 98.9 })]));

    expect(result.outcomeTp2).toEqual({
      outcome: 'LOSS',
      exitAt: at(2),
      candlesUntil: 2,
      exitIndex: 1,
    });
  });

  it('marks targets as EXPIRED when no stop or target is touched before expiration', () => {
    const result = evaluator.evaluate(buildRequest([candle(1, { high: 101, low: 99.5 })]));

    expect(result.outcomeTp1.outcome).toBe('EXPIRED');
    expect(result.outcomeTp1.exitAt).toBeUndefined();
    expect(result.outcomeTp1.candlesUntil).toBe(1);
    expect(result.outcomeTp2.outcome).toBe('EXPIRED');
  });

  it('marks a target as AMBIGUOUS when stop and target are touched in the same candle', () => {
    const result = evaluator.evaluate(buildRequest([candle(1, { high: 102.5, low: 98.5 })]));

    expect(result.outcomeTp1).toEqual({
      outcome: 'AMBIGUOUS',
      exitAt: at(1),
      candlesUntil: 1,
      exitIndex: 0,
    });
  });

  it('evaluates TP1 and TP2 independently so TP1 can WIN while TP2 can LOSS', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(1, { high: 102.5, low: 100 }), candle(2, { high: 101, low: 98.9 })]),
    );

    expect(result.outcomeTp1.outcome).toBe('WIN');
    expect(result.outcomeTp2.outcome).toBe('LOSS');
    expect(result.outcomeTp1.exitAt).toEqual(at(1));
    expect(result.outcomeTp2.exitAt).toEqual(at(2));
  });

  it('evaluates TP1 and TP2 independently so TP1 can WIN while TP2 can EXPIRE', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(1, { high: 102.5, low: 100 }), candle(2, { high: 104, low: 100 })]),
    );

    expect(result.outcomeTp1.outcome).toBe('WIN');
    expect(result.outcomeTp2.outcome).toBe('EXPIRED');
    expect(result.outcomeTp2.exitAt).toBeUndefined();
  });

  it('ignores candles before signalAt', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(-2, { low: 98 }), candle(-1, { high: 106 }), candle(1, { high: 101, low: 99.5 })]),
    );

    expect(result.outcomeTp1.outcome).toBe('EXPIRED');
    expect(result.outcomeTp2.outcome).toBe('EXPIRED');
  });

  it('ignores a candle exactly at signalAt', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(0, { high: 106, low: 98 }), candle(1, { high: 101, low: 99.5 })]),
    );

    expect(result.outcomeTp1.outcome).toBe('EXPIRED');
    expect(result.outcomeTp2.outcome).toBe('EXPIRED');
  });

  it('calculates MFE until the terminal target outcome', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(1, { high: 102.5, low: 100 }), candle(2, { high: 103.5, low: 99.4 })]),
    );

    expect(result.maxFavorableExcursionPercent).toBeCloseTo(3.5);
  });

  it('calculates MAE with a negative sign until the terminal target outcome', () => {
    const result = evaluator.evaluate(buildRequest([candle(1, { high: 101, low: 99.3 })]));

    expect(result.maxAdverseExcursionPercent).toBeCloseTo(-0.7);
  });

  it('uses one-based candlesUntil where the first future candle is 1', () => {
    const result = evaluator.evaluate(buildRequest([candle(1, { high: 102.2, low: 100 })]));

    expect(result.outcomeTp1.candlesUntil).toBe(1);
  });

  it('stores exitAt as the timestamp of the candle resolving the target', () => {
    const result = evaluator.evaluate(buildRequest([candle(1), candle(2, { high: 102.2, low: 100 })]));

    expect(result.outcomeTp1.exitAt).toEqual(at(2));
  });

  it('includes a candle exactly at expiresAt', () => {
    const result = evaluator.evaluate({
      ...buildRequest([candle(10, { high: 102.2, low: 100 })]),
      expiresAt: at(10),
    });

    expect(result.outcomeTp1.outcome).toBe('WIN');
    expect(result.outcomeTp1.exitAt).toEqual(at(10));
  });

  it('ignores candles after expiresAt', () => {
    const result = evaluator.evaluate({
      ...buildRequest([candle(11, { high: 106, low: 98 })]),
      expiresAt: at(10),
    });

    expect(result.outcomeTp1.outcome).toBe('EXPIRED');
    expect(result.outcomeTp2.outcome).toBe('EXPIRED');
    expect(result.terminalTimestamp).toBeUndefined();
  });

  it('sorts unordered candles before evaluating outcomes', () => {
    const result = evaluator.evaluate(
      buildRequest([candle(2, { low: 98.9 }), candle(1, { high: 102.2, low: 100 })]),
    );

    expect(result.outcomeTp1.outcome).toBe('WIN');
    expect(result.outcomeTp2.outcome).toBe('LOSS');
    expect(result.outcomeTp1.candlesUntil).toBe(1);
    expect(result.outcomeTp2.candlesUntil).toBe(2);
  });

  it.each([
    ['entry <= 0', { entry: 0 }, 'entry must be greater than 0'],
    ['stop >= entry', { stopLoss: 100 }, 'stopLoss must be below entry'],
    ['TP1 <= entry', { takeProfit1: 100 }, 'takeProfit1 must be above entry'],
    ['TP2 <= TP1', { takeProfit2: 102 }, 'takeProfit2 must be greater than takeProfit1'],
  ])('rejects invalid values: %s', (_caseName, overrides, expectedMessage) => {
    expect(() => evaluator.evaluate({ ...buildRequest(), ...overrides })).toThrow(expectedMessage);
  });
});
