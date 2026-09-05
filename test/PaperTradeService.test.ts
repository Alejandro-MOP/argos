import { PaperTradeMemoryRepository } from '../src/repositories/PaperTradeMemoryRepository';
import { PAPER_STRATEGY_V0_1, isPaperStrategyV01Eligible } from '../src/services/PaperStrategyConfig';
import { PaperTradeService, buildInitialLevels, priceFromPercent } from '../src/services/PaperTradeService';

describe('PaperTradeService', () => {
  it('accepts only STOCK 5m Score100 strategy v1 for paper-v0.1', () => {
    expect(isPaperStrategyV01Eligible({ assetType: 'STOCK', timeframe: '5m', score: 100, strategyVersion: 'v1', signalType: 'LONG' })).toBe(true);
    expect(isPaperStrategyV01Eligible({ assetType: 'ETF', timeframe: '5m', score: 100, strategyVersion: 'v1', signalType: 'LONG' })).toBe(false);
    expect(isPaperStrategyV01Eligible({ assetType: 'STOCK', timeframe: '15m', score: 100, strategyVersion: 'v1', signalType: 'LONG' })).toBe(false);
    expect(isPaperStrategyV01Eligible({ assetType: 'STOCK', timeframe: '5m', score: 95, strategyVersion: 'v1', signalType: 'LONG' })).toBe(false);
    expect(isPaperStrategyV01Eligible({ assetType: 'STOCK', timeframe: '5m', score: 100, strategyVersion: 'v2', signalType: 'LONG' })).toBe(false);
  });

  it('creates an immutable paper-v0.1 snapshot with frozen references and follow-up levels', async () => {
    const service = new PaperTradeService(new PaperTradeMemoryRepository(), { getCandles: jest.fn() });

    const trade = await service.createOpenTrade({
      ticker: 'nvda',
      assetType: 'STOCK',
      timeframe: '5m',
      score: 100,
      strategyVersion: 'v1',
      entryPrice: 100,
      entryAt: new Date('2026-09-05T15:00:00.000Z'),
    });

    expect(trade.ticker).toBe('NVDA');
    expect(trade.status).toBe('OPEN');
    expect(trade.paperStrategyVersion).toBe('paper-v0.1');
    expect(trade.referenceSnapshotDate).toBe('2026-09-05');
    expect(trade.mfeReferencePct).toBe(0.89);
    expect(trade.maeReferencePct).toBe(-1.05);
    expect(trade.strategyVersion).toBe('v1');
    expect(trade.levels?.map((level) => [level.type, level.levelPct, level.levelPrice])).toEqual([
      ['REFERENCE_FAVORABLE', 0.89, 100.89],
      ['REFERENCE_ADVERSE', -1.05, 98.95],
      ['PROFIT_LEVEL', 1.5, 101.5],
      ['PROFIT_LEVEL', 2, 102],
      ['PROFIT_LEVEL', 3, 103],
      ['PROFIT_LEVEL', 5, 105],
    ]);
  });

  it('rounds level prices to six decimals for low-priced assets', () => {
    expect(priceFromPercent(0.0854400023818016, 0.89)).toBe(0.0862);
    expect(buildInitialLevels(0.0854400023818016)[1].levelPrice).toBe(0.084543);
  });

  it('gets the current price from the latest 5m candle', async () => {
    const getCandles = jest.fn().mockResolvedValue([
      { timestamp: new Date('2026-09-05T15:00:00.000Z'), open: 98, high: 101, low: 97, close: 100, volume: 1000 },
    ]);
    const service = new PaperTradeService(new PaperTradeMemoryRepository(), { getCandles });

    await expect(service.getCurrentPrice('nvda')).resolves.toBe(100);
    expect(getCandles).toHaveBeenCalledWith('NVDA', PAPER_STRATEGY_V0_1.timeframe, 1);
  });
});
