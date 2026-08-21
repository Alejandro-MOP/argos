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
