import type { Signal } from '../src/models/Signal';
import { calculateTradePlan, validateTradePlanConfig } from '../src/utils/tradeSizing.utils';

const defaultConfig = {
  stopLossPercent: 1,
  targetMinPercent: 2,
  targetMaxPercent: 3,
};

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

describe('calculateTradePlan', () => {
  it('calculates financial stop and target scenarios over full capital', () => {
    expect(calculateTradePlan(buildSignal(), defaultConfig, 1_000)).toEqual({
      entry: 100,
      financialStop: {
        percent: 1,
        price: 99,
        estimatedLoss: 10,
      },
      technicalStop: {
        price: 95,
        source: 'last-candle-low',
      },
      targets: {
        min: {
          percent: 2,
          price: 102,
          estimatedProfit: 20,
          endingCapital: 1_020,
        },
        max: {
          percent: 3,
          price: 103,
          estimatedProfit: 30,
          endingCapital: 1_030,
        },
      },
      capital: 1_000,
      targetFeasibility: {
        minTargetPercent: 2,
        maxTargetPercent: 3,
        assessment: 'reasonable',
      },
    });
  });

  it('rounds prices and keeps technical stop separate from financial stop', () => {
    const tradePlan = calculateTradePlan(
      buildSignal({ entry: 351.89, stop: 340.1234 }),
      defaultConfig,
      1_000,
    );

    expect(tradePlan?.financialStop).toEqual({
      percent: 1,
      price: 348.37,
      estimatedLoss: 10,
    });
    expect(tradePlan?.technicalStop).toEqual({
      price: 340.12,
      source: 'last-candle-low',
    });
    expect(tradePlan?.targets.min).toMatchObject({ price: 358.93, estimatedProfit: 20 });
    expect(tradePlan?.targets.max).toMatchObject({ price: 362.45, estimatedProfit: 30 });
  });

  it('omits capital outcomes when capital is not provided', () => {
    expect(calculateTradePlan(buildSignal(), defaultConfig)).toEqual(
      expect.objectContaining({
        capital: undefined,
        financialStop: { percent: 1, price: 99, estimatedLoss: undefined },
        targets: {
          min: { percent: 2, price: 102, estimatedProfit: undefined, endingCapital: undefined },
          max: { percent: 3, price: 103, estimatedProfit: undefined, endingCapital: undefined },
        },
      }),
    );
  });

  it('returns undefined when entry is invalid', () => {
    expect(calculateTradePlan(buildSignal({ entry: 0 }), defaultConfig, 1_000)).toBeUndefined();
  });

  it('classifies aggressive target feasibility without blocking the trade plan', () => {
    expect(
      calculateTradePlan(buildSignal({ entry: 100, stop: 99.8 }), defaultConfig, 1_000)
        ?.targetFeasibility.assessment,
    ).toBe('very-aggressive');
  });
});

describe('validateTradePlanConfig', () => {
  it('requires positive stop and target percentages', () => {
    expect(() =>
      validateTradePlanConfig({ ...defaultConfig, stopLossPercent: 0 }),
    ).toThrow('TRADE_STOP_LOSS_PERCENT must be greater than 0');
    expect(() =>
      validateTradePlanConfig({ ...defaultConfig, targetMinPercent: 0 }),
    ).toThrow('TRADE_TARGET_MIN_PERCENT must be greater than 0');
  });

  it('requires target max to be greater than target min', () => {
    expect(() =>
      validateTradePlanConfig({ ...defaultConfig, targetMinPercent: 3, targetMaxPercent: 3 }),
    ).toThrow('TRADE_TARGET_MAX_PERCENT must be greater than TRADE_TARGET_MIN_PERCENT');
  });
});
