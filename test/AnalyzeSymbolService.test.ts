import type { Candle } from '../src/models/Candle';
import type { MarketUniverseSnapshot } from '../src/models/MarketSymbol';
import type { Opportunity } from '../src/models/Opportunity';
import { MarketDataProviderError, MarketDataRateLimitError } from '../src/errors/MarketDataErrors';
import {
  AnalyzeSymbolService,
  AnalyzeSymbolServiceError,
  normalizeAnalyzeSymbol,
  normalizeAnalyzeTimeframe,
} from '../src/services/AnalyzeSymbolService';

const buildCandles = (count = 80): Candle[] =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 7, 30, 10, index)),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index,
  }));

const buildOpportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  ticker: 'NVDA',
  timeframe: '15m',
  score: 90,
  trendScore: 25,
  volumeScore: 20,
  momentumScore: 20,
  structureScore: 25,
  reasons: ['EMA20 sobre EMA50', 'Breakout confirmado'],
  detectedAt: new Date('2026-08-30T10:00:00.000Z'),
  signalCandleTimestamp: new Date('2026-08-30T09:59:00.000Z'),
  ...overrides,
});

const marketUniverseSnapshot: MarketUniverseSnapshot = {
  source: 'postgres',
  symbols: [
    {
      symbol: 'NVDA',
      providerSymbol: 'NVDA',
      displayName: 'NVIDIA',
      assetType: 'STOCK',
      sector: 'Technology',
      industry: 'Semiconductors',
      exchange: 'NASDAQ',
      market: 'US',
      timezone: 'America/New_York',
      sessionType: 'US_REGULAR',
      supportsIntraday: true,
      isActive: true,
      timeframes: ['15m', '1d'],
    },
    {
      symbol: 'BTC',
      providerSymbol: 'BTC-USD',
      assetType: 'CRYPTO',
      market: 'Crypto',
      timezone: 'UTC',
      sessionType: 'TWENTY_FOUR_SEVEN',
      supportsIntraday: true,
      isActive: true,
      timeframes: ['1m', '15m', '1d'],
    },
  ],
};

const buildService = (overrides: Partial<ConstructorParameters<typeof AnalyzeSymbolService>[0]> = {}) => {
  const candles = buildCandles();
  const marketDataService = { getCandles: jest.fn().mockResolvedValue(candles) };
  const opportunityService = { analyze: jest.fn().mockReturnValue(buildOpportunity()) };
  const marketUniverseService = {
    loadSnapshot: jest.fn().mockResolvedValue(marketUniverseSnapshot),
    buildScanCandidates: jest.fn((snapshot: MarketUniverseSnapshot, request: { tickers?: string[]; timeframes?: string[] }) => {
      const symbol = snapshot.symbols.find((item) => item.symbol === request.tickers?.[0]);
      return symbol
        ? [{ symbol: symbol.symbol, providerSymbol: symbol.providerSymbol, timeframe: request.timeframes?.[0] ?? '1d', metadata: symbol, source: snapshot.source }]
        : [];
    }),
  };

  const service = new AnalyzeSymbolService({
    marketDataService,
    opportunityService,
    marketUniverseService,
    candleLimit: 80,
    operationalThreshold: 90,
    ...overrides,
  });

  return { service, marketDataService, opportunityService, marketUniverseService, candles };
};

describe('AnalyzeSymbolService', () => {
  it('normalizes symbol and timeframe before requesting market data', async () => {
    const { service, marketDataService, opportunityService } = buildService();

    await service.analyze({ symbol: ' nvda ', timeframe: '15M' });

    expect(marketDataService.getCandles).toHaveBeenCalledWith('NVDA', '15m', 80);
    expect(opportunityService.analyze).toHaveBeenCalledWith('NVDA', '15m', expect.any(Array));
  });

  it('uses providerSymbol and asset metadata from the market universe', async () => {
    const { service, marketDataService } = buildService({
      opportunityService: { analyze: jest.fn().mockReturnValue(buildOpportunity({ ticker: 'BTC', timeframe: '1m', score: 85 })) },
    });

    const result = await service.analyze({ symbol: 'btc', timeframe: '1m' });

    expect(marketDataService.getCandles).toHaveBeenCalledWith('BTC-USD', '1m', 80);
    expect(result).toEqual(expect.objectContaining({
      symbol: 'BTC',
      providerSymbol: 'BTC-USD',
      assetType: 'CRYPTO',
      score: 85,
      aboveOperationalThreshold: false,
    }));
  });

  it('returns latest close and latest candle timestamp from the last provider candle', async () => {
    const candles = buildCandles(80);
    const { service } = buildService({ marketDataService: { getCandles: jest.fn().mockResolvedValue(candles) } });

    const result = await service.analyze({ symbol: 'NVDA', timeframe: '15m' });

    expect(result.latestClose).toBe(candles[79].close);
    expect(result.latestCandleTimestamp).toEqual(candles[79].timestamp);
    expect(result.candlesReturned).toBe(80);
  });

  it('falls back to minimal metadata for a manual unknown symbol without persisting it', async () => {
    const { service, marketDataService } = buildService();

    const result = await service.analyze({ symbol: 'doge-usd', timeframe: '1d' });

    expect(marketDataService.getCandles).toHaveBeenCalledWith('DOGE-USD', '1d', 80);
    expect(result.assetType).toBe('CRYPTO');
    expect(result.providerSymbol).toBe('DOGE-USD');
  });

  it('rejects invalid symbols and unsupported timeframes', () => {
    expect(() => normalizeAnalyzeSymbol('')).toThrow(AnalyzeSymbolServiceError);
    expect(() => normalizeAnalyzeSymbol('NVDA/USD')).toThrow(AnalyzeSymbolServiceError);
    expect(() => normalizeAnalyzeTimeframe('4h')).toThrow(AnalyzeSymbolServiceError);
  });

  it('maps insufficient provider candles to a controlled error', async () => {
    const { service } = buildService({ marketDataService: { getCandles: jest.fn().mockResolvedValue(buildCandles(13)) } });

    await expect(service.analyze({ symbol: 'NVDA', timeframe: '15m' })).rejects.toMatchObject({
      code: 'insufficient-candles',
    });
  });

  it('maps provider rate limits to a controlled error', async () => {
    const { service } = buildService({
      marketDataService: { getCandles: jest.fn().mockRejectedValue(new MarketDataRateLimitError('yahoo', 429, '/chart')) },
    });

    await expect(service.analyze({ symbol: 'NVDA', timeframe: '15m' })).rejects.toMatchObject({
      code: 'rate-limit-exceeded',
      status: 429,
    });
  });

  it('maps provider failures to a safe market-data error', async () => {
    const { service } = buildService({
      marketDataService: { getCandles: jest.fn().mockRejectedValue(new MarketDataProviderError({ provider: 'yahoo', message: 'provider failed', status: 404 })) },
    });

    await expect(service.analyze({ symbol: 'NVDA', timeframe: '15m' })).rejects.toMatchObject({
      code: 'market-data-unavailable',
      status: 404,
    });
  });
});
