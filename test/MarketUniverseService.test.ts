import { MarketUniverseService } from '../src/services/MarketUniverseService';

const nvdaSymbol = {
  id: 'symbol-id',
  symbol: 'NVDA',
  providerSymbol: 'NVDA',
  displayName: 'NVDA',
  assetType: 'STOCK' as const,
  sector: 'Technology',
  industry: 'Semiconductors',
  exchange: 'NASDAQ',
  market: 'US',
  timezone: 'America/New_York',
  sessionType: 'US_REGULAR' as const,
  supportsIntraday: true,
  description: 'NVIDIA',
  isActive: true,
  timeframes: ['1m', '15m'],
};

const buildLogger = () => ({ log: jest.fn(), error: jest.fn() });

describe('MarketUniverseService', () => {
  it('loads active symbols and builds symbol/timeframe candidates from PostgreSQL universe', async () => {
    const repository = { findActiveWithTimeframes: jest.fn().mockResolvedValue([nvdaSymbol]) };
    const service = new MarketUniverseService(repository, { getTickers: jest.fn() } as never);
    const logger = buildLogger();

    const snapshot = await service.loadSnapshot(logger);
    const candidates = service.buildScanCandidates(
      snapshot,
      { fallbackTimeframes: ['1d'] },
      logger,
    );

    expect(snapshot.source).toBe('postgres');
    expect(candidates).toEqual([
      expect.objectContaining({ symbol: 'NVDA', providerSymbol: 'NVDA', timeframe: '1m' }),
      expect.objectContaining({ symbol: 'NVDA', providerSymbol: 'NVDA', timeframe: '15m' }),
    ]);
    expect(logger.log).toHaveBeenCalledWith('universeSource=postgres');
  });

  it('keeps expanded market universe segmentation metadata in scan candidates', async () => {
    const spySymbol = {
      ...nvdaSymbol,
      id: 'spy-id',
      symbol: 'SPY',
      providerSymbol: 'SPY',
      displayName: 'SPY',
      assetType: 'ETF' as const,
      sector: 'Broad Market',
      industry: 'S&P 500 ETF',
      exchange: 'NYSEARCA',
      timeframes: ['1m', '5m', '15m', '1d', '1w'],
    };
    const smhSymbol = {
      ...nvdaSymbol,
      id: 'smh-id',
      symbol: 'SMH',
      providerSymbol: 'SMH',
      displayName: 'SMH',
      assetType: 'ETF' as const,
      sector: 'Semiconductors',
      industry: 'Semiconductor ETF',
      exchange: 'NASDAQ',
      timeframes: ['15m', '1d'],
    };
    const repository = { findActiveWithTimeframes: jest.fn().mockResolvedValue([spySymbol, smhSymbol]) };
    const service = new MarketUniverseService(repository, { getTickers: jest.fn() } as never);

    const snapshot = await service.loadSnapshot();
    const candidates = service.buildScanCandidates(snapshot, { tickers: ['SMH'], fallbackTimeframes: ['1d'] });

    expect(snapshot.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'SPY', assetType: 'ETF', sector: 'Broad Market' }),
      expect.objectContaining({ symbol: 'SMH', assetType: 'ETF', sector: 'Semiconductors' }),
    ]));
    expect(candidates).toEqual([
      expect.objectContaining({
        symbol: 'SMH',
        providerSymbol: 'SMH',
        timeframe: '15m',
        source: 'postgres',
        metadata: expect.objectContaining({ assetType: 'ETF', sector: 'Semiconductors' }),
      }),
      expect.objectContaining({ symbol: 'SMH', providerSymbol: 'SMH', timeframe: '1d' }),
    ]);
  });

  it('allows manual unknown tickers with minimal metadata and does not insert them', async () => {
    const repository = { findActiveWithTimeframes: jest.fn().mockResolvedValue([nvdaSymbol]) };
    const service = new MarketUniverseService(repository, { getTickers: jest.fn() } as never);
    const logger = buildLogger();

    const snapshot = await service.loadSnapshot(logger);
    const candidates = service.buildScanCandidates(
      snapshot,
      { tickers: ['XYZ'], timeframes: ['1m'], fallbackTimeframes: ['15m'] },
      logger,
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        symbol: 'XYZ',
        providerSymbol: 'XYZ',
        timeframe: '1m',
        source: 'manual-fallback',
      }),
    ]);
    expect(logger.log).toHaveBeenCalledWith('symbol-not-in-market-universe symbol=XYZ');
    expect(repository.findActiveWithTimeframes).toHaveBeenCalledTimes(1);
  });
});
