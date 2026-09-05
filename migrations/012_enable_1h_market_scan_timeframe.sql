ALTER TABLE market_signal_engine.symbol_timeframes
DROP CONSTRAINT IF EXISTS symbol_timeframes_timeframe_check;

ALTER TABLE market_signal_engine.symbol_timeframes
ADD CONSTRAINT symbol_timeframes_timeframe_check
CHECK (
  timeframe IN (
    '1m',
    '5m',
    '15m',
    '30m',
    '1h',
    '1d',
    '1w'
  )
);

INSERT INTO market_signal_engine.symbol_timeframes (
  symbol_id,
  timeframe,
  is_active
)
SELECT
  symbol.id,
  '1h',
  true
FROM market_signal_engine.market_symbols symbol
WHERE symbol.is_active = true
ON CONFLICT (symbol_id, timeframe)
DO UPDATE SET
  is_active = true,
  updated_at = now();
