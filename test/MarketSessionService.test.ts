import type { MarketSymbol } from '../src/models/MarketSymbol';
import { MarketSessionService } from '../src/services/MarketSessionService';

const buildSymbol = (overrides: Partial<MarketSymbol>): MarketSymbol => ({
  symbol: 'NVDA',
  providerSymbol: 'NVDA',
  displayName: 'NVDA',
  assetType: 'STOCK',
  market: 'US',
  exchange: 'NASDAQ',
  timezone: 'America/New_York',
  sessionType: 'US_REGULAR',
  supportsIntraday: true,
  isActive: true,
  timeframes: ['1m'],
  ...overrides,
});

describe('MarketSessionService', () => {
  it('blocks US regular intraday scans outside regular market hours', () => {
    const service = new MarketSessionService();
    const decision = service.canScan(buildSymbol({}), '1m', new Date('2026-01-05T22:00:00.000Z'));

    expect(decision).toEqual({ canScan: false, reason: 'market-closed' });
  });

  it('allows daily and weekly stock scans outside regular market hours', () => {
    const service = new MarketSessionService();
    const now = new Date('2026-01-05T22:00:00.000Z');

    expect(service.canScan(buildSymbol({}), '1d', now)).toEqual({ canScan: true });
    expect(service.canScan(buildSymbol({}), '1w', now)).toEqual({ canScan: true });
  });

  it('allows crypto scans 24/7 so stale-data validation can still apply', () => {
    const service = new MarketSessionService();
    const crypto = buildSymbol({
      symbol: 'BTC-USD',
      providerSymbol: 'BTC-USD',
      assetType: 'CRYPTO',
      market: 'Crypto',
      exchange: undefined,
      timezone: 'UTC',
      sessionType: 'TWENTY_FOUR_SEVEN',
    });

    expect(service.canScan(crypto, '1m', new Date('2026-01-05T04:00:00.000Z'))).toEqual({
      canScan: true,
    });
  });
});
