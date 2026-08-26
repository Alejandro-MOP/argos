import type { Queryable } from '../db/postgres';
import type { AssetType, MarketSymbol, SessionType } from '../models/MarketSymbol';
import type { MarketSymbolRepository } from '../ports/MarketSymbolRepository';

interface MarketSymbolRow {
  id: string;
  symbol: string;
  provider_symbol: string | null;
  display_name: string | null;
  asset_type: AssetType;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  market: string | null;
  timezone: string;
  session_type: SessionType;
  supports_intraday: boolean;
  description: string | null;
  is_active: boolean;
  timeframes: string[] | null;
}

export class PostgresMarketSymbolRepository implements MarketSymbolRepository {
  public constructor(private readonly database: Queryable) {}

  public async findActiveWithTimeframes(): Promise<MarketSymbol[]> {
    const result = await this.database.query<MarketSymbolRow>(
      `SELECT
        symbol.id,
        symbol.symbol,
        symbol.provider_symbol,
        symbol.display_name,
        symbol.asset_type,
        symbol.sector,
        symbol.industry,
        symbol.exchange,
        symbol.market,
        symbol.timezone,
        symbol.session_type,
        symbol.supports_intraday,
        symbol.description,
        symbol.is_active,
        COALESCE(
          array_agg(timeframe.timeframe ORDER BY timeframe.timeframe) FILTER (WHERE timeframe.timeframe IS NOT NULL),
          ARRAY[]::varchar[]
        ) AS timeframes
      FROM market_symbols symbol
      LEFT JOIN symbol_timeframes timeframe
        ON timeframe.symbol_id = symbol.id
       AND timeframe.is_active = true
      WHERE symbol.is_active = true
      GROUP BY symbol.id
      ORDER BY symbol.symbol`,
    );

    return result.rows.map(mapMarketSymbolRow);
  }
}

const mapMarketSymbolRow = (row: MarketSymbolRow): MarketSymbol => ({
  id: row.id,
  symbol: row.symbol,
  providerSymbol: row.provider_symbol ?? row.symbol,
  displayName: row.display_name ?? undefined,
  assetType: row.asset_type,
  sector: row.sector ?? undefined,
  industry: row.industry ?? undefined,
  exchange: row.exchange ?? undefined,
  market: row.market ?? undefined,
  timezone: row.timezone,
  sessionType: row.session_type,
  supportsIntraday: row.supports_intraday,
  description: row.description ?? undefined,
  isActive: row.is_active,
  timeframes: row.timeframes ?? [],
});
