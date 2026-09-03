-- V1.5-E.1 — Add VOO to Market Universe
-- Data-only, idempotent, non-destructive. Agrega Vanguard S&P 500 ETF al universo activo.

WITH voo_symbol(
  symbol,
  provider_symbol,
  display_name,
  asset_type,
  sector,
  industry,
  market,
  exchange,
  timezone,
  session_type,
  supports_intraday,
  description,
  is_active
) AS (
  VALUES (
    'VOO',
    'VOO',
    'Vanguard S&P 500 ETF',
    'ETF',
    'Broad Market',
    'S&P 500 ETF',
    'US',
    'NYSEARCA',
    'America/New_York',
    'US_REGULAR',
    true,
    'Vanguard S&P 500 ETF.',
    true
  )
)
INSERT INTO market_signal_engine.market_symbols (
  symbol,
  provider_symbol,
  display_name,
  asset_type,
  sector,
  industry,
  market,
  exchange,
  timezone,
  session_type,
  supports_intraday,
  description,
  is_active
)
SELECT
  symbol,
  provider_symbol,
  display_name,
  asset_type,
  sector,
  industry,
  market,
  exchange,
  timezone,
  session_type,
  supports_intraday,
  description,
  is_active
FROM voo_symbol
ON CONFLICT (symbol) DO UPDATE SET
  provider_symbol = EXCLUDED.provider_symbol,
  display_name = EXCLUDED.display_name,
  asset_type = EXCLUDED.asset_type,
  sector = EXCLUDED.sector,
  industry = EXCLUDED.industry,
  market = EXCLUDED.market,
  exchange = EXCLUDED.exchange,
  timezone = EXCLUDED.timezone,
  session_type = EXCLUDED.session_type,
  supports_intraday = EXCLUDED.supports_intraday,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

WITH voo_symbol AS (
  SELECT id
  FROM market_signal_engine.market_symbols
  WHERE symbol = 'VOO'
    AND is_active = true
), supported_timeframes(timeframe) AS (
  VALUES ('1m'), ('5m'), ('15m'), ('1d'), ('1w')
)
INSERT INTO market_signal_engine.symbol_timeframes (symbol_id, timeframe, is_active)
SELECT voo_symbol.id, supported_timeframes.timeframe, true
FROM voo_symbol
CROSS JOIN supported_timeframes
ON CONFLICT (symbol_id, timeframe) DO UPDATE SET
  is_active = true,
  updated_at = now();
