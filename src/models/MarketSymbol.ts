export type AssetType = 'STOCK' | 'ETF' | 'CRYPTO' | 'INDEX' | 'FOREX' | 'COMMODITY' | 'REIT' | 'FUTURE';
export type SessionType = 'US_REGULAR' | 'TWENTY_FOUR_SEVEN';

export interface MarketSymbol {
  id?: string;
  symbol: string;
  providerSymbol: string;
  displayName?: string;
  assetType: AssetType;
  sector?: string;
  industry?: string;
  exchange?: string;
  market?: string;
  timezone: string;
  sessionType: SessionType;
  supportsIntraday: boolean;
  description?: string;
  isActive: boolean;
  timeframes: string[];
}

export type MarketUniverseSource = 'postgres';

export interface MarketUniverseSnapshot {
  source: MarketUniverseSource;
  symbols: MarketSymbol[];
}

export interface MarketScanCandidate {
  symbol: string;
  providerSymbol: string;
  timeframe: string;
  metadata: MarketSymbol;
  source: MarketUniverseSource;
}
