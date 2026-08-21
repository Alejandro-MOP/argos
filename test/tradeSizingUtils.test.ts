import type { Signal } from '../src/models/Signal';
import { calculateTradeSizing } from '../src/utils/tradeSizing.utils';

const buildSignal = (overrides: Partial<Signal> = {}): Signal => ({
  ticker: 'SPY',
  timeframe: '1d',
  entry: 100,
  stop: 95,
  target: 110,
  score: 90,
  signalType: 'LONG',
  createdAt: new Date('2026-08-21T12:00:00.000Z'),
  ...overrides,
});

describe('calculateTradeSizing', () => {
  it('calculates estimated loss and estimated profit from available capital', () => {
    expect(calculateTradeSizing(buildSignal(), 1_000)).toEqual({
      capital: 1_000,
      estimatedLoss: 50,
      estimatedProfit: 100,
    });
  });

  it('rounds money outputs', () => {
    expect(calculateTradeSizing(buildSignal({ entry: 107.555, stop: 98.77, target: 125.125 }), 500))
      .toEqual({
        capital: 500,
        estimatedLoss: 40.84,
        estimatedProfit: 81.68,
      });
  });

  it('returns undefined for invalid capital or invalid risk', () => {
    expect(calculateTradeSizing(buildSignal(), 0)).toBeUndefined();
    expect(calculateTradeSizing(buildSignal({ entry: 100, stop: 100 }), 1_000)).toBeUndefined();
  });
});
