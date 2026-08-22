import { parseTradePlanConfig } from '../src/config/env';

describe('parseTradePlanConfig', () => {
  it('uses default trade plan percentages', () => {
    expect(parseTradePlanConfig({})).toEqual({
      stopLossPercent: 1,
      targetMinPercent: 2,
      targetMaxPercent: 3,
    });
  });

  it('parses configured trade plan percentages', () => {
    expect(
      parseTradePlanConfig({
        TRADE_STOP_LOSS_PERCENT: '1.5',
        TRADE_TARGET_MIN_PERCENT: '2.5',
        TRADE_TARGET_MAX_PERCENT: '4',
      }),
    ).toEqual({
      stopLossPercent: 1.5,
      targetMinPercent: 2.5,
      targetMaxPercent: 4,
    });
  });

  it('rejects invalid trade plan configuration', () => {
    expect(() => parseTradePlanConfig({ TRADE_STOP_LOSS_PERCENT: '-1' })).toThrow(
      'TRADE_STOP_LOSS_PERCENT must be greater than 0',
    );
    expect(() =>
      parseTradePlanConfig({ TRADE_TARGET_MIN_PERCENT: '3', TRADE_TARGET_MAX_PERCENT: '2' }),
    ).toThrow('TRADE_TARGET_MAX_PERCENT must be greater than TRADE_TARGET_MIN_PERCENT');
  });
});


describe('signal intelligence env defaults', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
  });

  it('uses default Signal Intelligence configuration', async () => {
    jest.resetModules();
    process.env = {};

    const { env } = await import('../src/config/env');

    expect(env.signalIntelligence).toEqual({
      backtestContextEnabled: true,
      backtestContextMonths: 24,
      performanceMinSampleSize: 20,
      forwardTestContextEnabled: true,
    });
  });

  it('parses Signal Intelligence overrides', async () => {
    jest.resetModules();
    process.env = {
      BACKTEST_CONTEXT_ENABLED: 'false',
      BACKTEST_CONTEXT_MONTHS: '12',
      PERFORMANCE_MIN_SAMPLE_SIZE: '8',
      FORWARD_TEST_CONTEXT_ENABLED: 'false',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.signalIntelligence).toEqual({
      backtestContextEnabled: false,
      backtestContextMonths: 12,
      performanceMinSampleSize: 8,
      forwardTestContextEnabled: false,
    });
  });
});
