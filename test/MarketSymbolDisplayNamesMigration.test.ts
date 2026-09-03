import { readFileSync } from 'fs';
import { join } from 'path';

const migrationSql = readFileSync(
  join(process.cwd(), 'migrations', '010_fix_market_symbol_display_names.sql'),
  'utf8',
);

describe('V1.5-E.1 market symbol display names migration', () => {
  it('is data-only and non-destructive', () => {
    expect(migrationSql).not.toMatch(/\bDELETE\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bINSERT\s+INTO\s+market_signal_engine\.market_symbols\b/i);
    expect(migrationSql).not.toMatch(/\bsymbol_timeframes\b/i);
  });

  it('updates only display_name metadata on active market symbols', () => {
    expect(migrationSql).toContain('UPDATE market_signal_engine.market_symbols AS symbol');
    expect(migrationSql).toContain('SET display_name = human_friendly_names.display_name');
    expect(migrationSql).toContain('updated_at = now()');
    expect(migrationSql).toContain('AND symbol.is_active = true');
    expect(migrationSql).toContain('AND symbol.display_name IS DISTINCT FROM human_friendly_names.display_name');
    const setBlock = migrationSql.match(/SET[\s\S]*?FROM human_friendly_names/i)?.[0] ?? '';

    expect(setBlock).not.toMatch(/provider_symbol\s=/i);
    expect(setBlock).not.toMatch(/asset_type\s=/i);
    expect(setBlock).not.toMatch(/sector\s=/i);
    expect(setBlock).not.toMatch(/industry\s=/i);
    expect(setBlock).not.toMatch(/is_active\s=/i);
  });

  it('contains human-friendly names for representative symbols', () => {
    expect(migrationSql).toContain("('NVDA', 'NVIDIA')");
    expect(migrationSql).toContain("('AMD', 'Advanced Micro Devices')");
    expect(migrationSql).toContain("('TSM', 'Taiwan Semiconductor')");
    expect(migrationSql).toContain("('BTC-USD', 'Bitcoin')");
    expect(migrationSql).toContain("('ETH-USD', 'Ethereum')");
    expect(migrationSql).toContain("('SPY', 'SPDR S&P 500 ETF')");
  });
});
