import type { Candle } from '../src/models/Candle';
import {
  calculateRLevelPrice,
  calculateRiskPct,
  calculateTarget2R,
  detectBreakout,
  detectFvg,
  evaluateOrbFvgOutcome,
  filterClosedOneMinuteCandles,
  findOpeningRangeCandle,
} from '../src/orbFvg/OrbFvgMath';
import { OrbFvgSessionService } from '../src/orbFvg/OrbFvgSessionService';

const candle = (timestamp: string, open: number, high: number, low: number, close: number): Candle => ({
  timestamp: new Date(timestamp),
  open,
  high,
  low,
  close,
  volume: 100,
});

describe('ORB-FVG math', () => {
  it('builds the 09:30-09:45 ET opening range window during EDT', () => {
    const service = new OrbFvgSessionService();
    const window = service.getCurrentSessionWindow(new Date('2026-09-04T14:00:00.000Z'));

    expect(window?.sessionDate).toBe('2026-09-04');
    expect(window?.startsAt.toISOString()).toBe('2026-09-04T13:30:00.000Z');
    expect(window?.endsAt.toISOString()).toBe('2026-09-04T13:45:00.000Z');
  });

  it('builds the 09:30-09:45 ET opening range window during EST', () => {
    const service = new OrbFvgSessionService();
    const window = service.getCurrentSessionWindow(new Date('2026-12-07T15:00:00.000Z'));

    expect(window?.startsAt.toISOString()).toBe('2026-12-07T14:30:00.000Z');
    expect(window?.endsAt.toISOString()).toBe('2026-12-07T14:45:00.000Z');
  });

  it('does not create a session window on weekends', () => {
    const service = new OrbFvgSessionService();

    expect(service.getCurrentSessionWindow(new Date('2026-09-05T15:00:00.000Z'))).toBeUndefined();
  });

  it('selects the closed opening range candle and ignores incorrect or incomplete candles', () => {
    const service = new OrbFvgSessionService();
    const window = service.getSessionWindow('2026-09-04');
    const openingRange = candle('2026-09-04T13:30:00.000Z', 100, 102, 99, 101);

    expect(findOpeningRangeCandle([candle('2026-09-04T13:45:00.000Z', 101, 103, 100, 102), openingRange], window, new Date('2026-09-04T13:44:59.000Z'))).toBeUndefined();
    expect(findOpeningRangeCandle([openingRange], window, new Date('2026-09-04T13:45:00.000Z'))).toBe(openingRange);
  });

  it('accepts an opening range timestamp inside the 09:30-09:45 ET window', () => {
    const service = new OrbFvgSessionService();
    const window = service.getSessionWindow('2026-09-04');
    const openingRange = candle('2026-09-04T13:31:00.000Z', 100, 102, 99, 101);

    expect(findOpeningRangeCandle([openingRange], window, new Date('2026-09-04T13:46:00.000Z'))).toBe(openingRange);
  });

  it('filters out 1m candles still in formation', () => {
    const closed = candle('2026-09-04T13:46:00.000Z', 100, 101, 99, 100.5);
    const forming = candle('2026-09-04T13:47:00.000Z', 100.5, 101, 100, 100.8);

    expect(filterClosedOneMinuteCandles([forming, closed], new Date('2026-09-04T13:47:30.000Z'))).toEqual([closed]);
  });

  it('detects valid and invalid LONG breakouts', () => {
    expect(detectBreakout(100, 90, candle('2026-09-04T13:46:00.000Z', 99.8, 101, 99, 100.5))).toMatchObject({ direction: 'LONG' });
    expect(detectBreakout(100, 90, candle('2026-09-04T13:46:00.000Z', 99.8, 101, 99, 99.9))).toBeUndefined();
    expect(detectBreakout(100, 90, candle('2026-09-04T13:46:00.000Z', 100.1, 101, 100, 100.5))).toBeUndefined();
  });

  it('detects valid and invalid SHORT breakouts', () => {
    expect(detectBreakout(100, 90, candle('2026-09-04T13:46:00.000Z', 90.2, 91, 89, 89.5))).toMatchObject({ direction: 'SHORT' });
    expect(detectBreakout(100, 90, candle('2026-09-04T13:46:00.000Z', 90.2, 91, 89, 90.1))).toBeUndefined();
    expect(detectBreakout(100, 90, candle('2026-09-04T13:46:00.000Z', 89.9, 90, 89, 89.5))).toBeUndefined();
  });

  it('detects bullish and bearish FVGs without counting exact boundary touches', () => {
    expect(detectFvg(candle('2026-09-04T13:46:00.000Z', 100, 101, 99, 100), candle('2026-09-04T13:47:00.000Z', 101, 102, 100, 101.5), candle('2026-09-04T13:48:00.000Z', 102, 103, 101.1, 102.5))).toMatchObject({ direction: 'LONG', fvgLow: 101, fvgHigh: 101.1 });
    expect(detectFvg(candle('2026-09-04T13:46:00.000Z', 100, 101, 99, 100), candle('2026-09-04T13:47:00.000Z', 99, 100, 98, 99), candle('2026-09-04T13:48:00.000Z', 98, 98.9, 97, 97.5))).toMatchObject({ direction: 'SHORT', fvgLow: 98.9, fvgHigh: 99 });
    expect(detectFvg(candle('2026-09-04T13:46:00.000Z', 100, 101, 99, 100), candle('2026-09-04T13:47:00.000Z', 101, 102, 100, 101.5), candle('2026-09-04T13:48:00.000Z', 102, 103, 101, 102.5))).toBeUndefined();
  });

  it('calculates entry risk target and R levels for LONG and SHORT', () => {
    expect(calculateRiskPct(2, 100)).toBe(2);
    expect(calculateTarget2R('LONG', 100, 2)).toBe(104);
    expect(calculateTarget2R('SHORT', 100, 2)).toBe(96);
    expect(calculateRLevelPrice('LONG', 100, 2, 1.5)).toBe(103);
    expect(calculateRLevelPrice('SHORT', 100, 2, 1.5)).toBe(97);
  });

  it('evaluates LONG outcomes including WIN LOSS AMBIGUOUS and EXPIRED', () => {
    const base = { direction: 'LONG' as const, entryPrice: 100, stopPrice: 99, target2RPrice: 102, signalAt: new Date('2026-09-04T13:48:00.000Z'), expiresAt: new Date('2026-09-04T20:00:00.000Z') };

    expect(evaluateOrbFvgOutcome({ ...base, candles: [candle('2026-09-04T13:49:00.000Z', 100, 102.1, 99.8, 102)] }).status).toBe('WIN');
    expect(evaluateOrbFvgOutcome({ ...base, candles: [candle('2026-09-04T13:49:00.000Z', 100, 100.2, 98.9, 99)] }).status).toBe('LOSS');
    expect(evaluateOrbFvgOutcome({ ...base, candles: [candle('2026-09-04T13:49:00.000Z', 100, 102.1, 98.9, 100)] }).status).toBe('AMBIGUOUS');
    expect(evaluateOrbFvgOutcome({ ...base, now: new Date('2026-09-04T20:01:00.000Z'), candles: [] }).status).toBe('EXPIRED');
  });

  it('evaluates SHORT outcomes and preserves MFE positive / MAE negative semantics', () => {
    const result = evaluateOrbFvgOutcome({
      direction: 'SHORT',
      entryPrice: 100,
      stopPrice: 101,
      target2RPrice: 98,
      signalAt: new Date('2026-09-04T13:48:00.000Z'),
      expiresAt: new Date('2026-09-04T20:00:00.000Z'),
      candles: [candle('2026-09-04T13:49:00.000Z', 100, 100.4, 97.9, 98)],
    });

    expect(result.status).toBe('WIN');
    expect(result.mfePct).toBeGreaterThan(0);
    expect(result.maePct).toBeLessThan(0);
    expect(result.maxR).toBeGreaterThanOrEqual(2);
  });
});
