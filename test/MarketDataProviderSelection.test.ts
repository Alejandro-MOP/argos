import { FinnhubClient } from '../src/clients/FinnhubClient';
import { PolygonClient } from '../src/clients/PolygonClient';
import { createMarketDataProvider } from '../src/config/container';

describe('market data provider selection', () => {
  const originalProvider = process.env.MARKET_DATA_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.MARKET_DATA_PROVIDER;
    } else {
      process.env.MARKET_DATA_PROVIDER = originalProvider;
    }

    jest.resetModules();
  });

  it('creates Polygon by default through the container factory', () => {
    expect(createMarketDataProvider('polygon', false)).toBeInstanceOf(PolygonClient);
  });

  it('creates Finnhub through the container factory', () => {
    expect(createMarketDataProvider('finnhub', false)).toBeInstanceOf(FinnhubClient);
  });

  it('defaults MARKET_DATA_PROVIDER to polygon when env is not set', async () => {
    delete process.env.MARKET_DATA_PROVIDER;
    jest.resetModules();

    const { env } = await import('../src/config/env');

    expect(env.marketDataProvider).toBe('polygon');
  });

  it('changes MARKET_DATA_PROVIDER to finnhub through env', async () => {
    process.env.MARKET_DATA_PROVIDER = 'finnhub';
    jest.resetModules();

    const { env } = await import('../src/config/env');

    expect(env.marketDataProvider).toBe('finnhub');
  });
});
