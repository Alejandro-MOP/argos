import { readFileSync } from 'fs';
import { join } from 'path';

const migrationSql = readFileSync(
  join(process.cwd(), 'migrations', '009_expand_market_universe.sql'),
  'utf8',
);

describe('V1.6-A market universe expansion migration', () => {
  it('is data-only and non-destructive', () => {
    expect(migrationSql).not.toMatch(/\bDELETE\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it('seeds the new segmented ETF and stock universe with provider symbols', () => {
    expect(migrationSql).toContain("('SPY', 'SPY', 'ETF', 'Broad Market'");
    expect(migrationSql).toContain("('XLK', 'XLK', 'ETF', 'Technology'");
    expect(migrationSql).toContain("('SMH', 'SMH', 'ETF', 'Semiconductors'");
    expect(migrationSql).toContain("('TLT', 'TLT', 'ETF', 'Rates'");
    expect(migrationSql).toContain("('TSM', 'TSM', 'STOCK', 'Technology', 'Semiconductors'");
    expect(migrationSql).toContain("('AMT', 'AMT', 'STOCK', 'Real Estate', 'REIT - Specialty'");
  });

  it('adds all supported scan timeframes for expanded symbols only', () => {
    expect(migrationSql).toContain("VALUES ('1m'), ('5m'), ('15m'), ('1d'), ('1w')");
    expect(migrationSql).toContain('WITH expanded_symbols(symbol) AS');
    expect(migrationSql).toContain('AND market_symbols.is_active = true');
  });

  it('keeps existing metadata unless it fills a missing value', () => {
    expect(migrationSql).toContain('ON CONFLICT (symbol) DO UPDATE SET');
    expect(migrationSql).toContain('asset_type = market_signal_engine.market_symbols.asset_type');
    expect(migrationSql).toContain('session_type = market_signal_engine.market_symbols.session_type');
    expect(migrationSql).toContain("WHERE symbol = 'GLD'");
    expect(migrationSql).toContain("SET sector = 'Metals'");
  });
});
