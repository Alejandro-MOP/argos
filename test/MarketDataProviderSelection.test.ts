import { FinnhubClient } from '../src/clients/FinnhubClient';
import { PolygonClient } from '../src/clients/PolygonClient';
import { YahooFinanceClient } from '../src/clients/YahooFinanceClient';
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

  it('creates Yahoo Finance through the container factory', () => {
    expect(createMarketDataProvider('yahoo', false)).toBeInstanceOf(YahooFinanceClient);
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

  it('changes MARKET_DATA_PROVIDER to yahoo through env', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    jest.resetModules();

    const { env } = await import('../src/config/env');

    expect(env.marketDataProvider).toBe('yahoo');
  });
});
