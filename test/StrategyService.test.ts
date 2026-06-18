import type { Candle } from '../src/models/Candle';
import { BreakoutStrategy, StrategyService } from '../src/services/StrategyService';

const buildCandles = (): Candle[] => {
  return Array.from({ length: 21 }, (_, index) => {
    const isLast = index === 20;
    const close = isLast ? 130 : 100 + index;

    return {
      timestamp: new Date(),
      open: close - 1,
      high: isLast ? 130.5 : close + 0.5,
      low: close - 2,
      close,
      volume: isLast ? 3_000_000 : 1_000_000,
    };
  });
};

describe('StrategyService', () => {
  it('detects a long breakout with volume confirmation', () => {
    const service = new StrategyService([new BreakoutStrategy()]);
    const signal = service.detectBreakout('SPY', '15m', buildCandles());

    expect(signal).toMatchObject({
      ticker: 'SPY',
      timeframe: '15m',
      signalType: 'LONG',
    });
    expect(signal?.score).toBeGreaterThan(0);
  });
});
