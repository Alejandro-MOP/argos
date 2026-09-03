import { readFileSync } from 'fs';
import { join } from 'path';

const migrationSql = readFileSync(
  join(process.cwd(), 'migrations', '011_add_voo_market_symbol.sql'),
  'utf8',
);

describe('V1.5-E.1 VOO market universe migration', () => {
  it('is data-only and non-destructive', () => {
    expect(migrationSql).not.toMatch(/\bDELETE\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it('adds VOO with complete Market Universe metadata', () => {
    expect(migrationSql).toContain("'VOO'");
    expect(migrationSql).toContain("'Vanguard S&P 500 ETF'");
    expect(migrationSql).toContain("'ETF'");
    expect(migrationSql).toContain("'Broad Market'");
    expect(migrationSql).toContain("'S&P 500 ETF'");
    expect(migrationSql).toContain("'NYSEARCA'");
    expect(migrationSql).toContain("'America/New_York'");
    expect(migrationSql).toContain("'US_REGULAR'");
  });

  it('activates all supported analysis timeframes for VOO', () => {
    expect(migrationSql).toContain("VALUES ('1m'), ('5m'), ('15m'), ('1d'), ('1w')");
    expect(migrationSql).toContain('INSERT INTO market_signal_engine.symbol_timeframes');
    expect(migrationSql).toContain("WHERE symbol = 'VOO'");
    expect(migrationSql).toContain('ON CONFLICT (symbol_id, timeframe) DO UPDATE SET');
  });
});
