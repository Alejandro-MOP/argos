ALTER TABLE market_signal_engine.opportunities
  ADD COLUMN IF NOT EXISTS signal_candle_timestamp TIMESTAMPTZ;

ALTER TABLE market_signal_engine.signals
  ADD COLUMN IF NOT EXISTS signal_candle_timestamp TIMESTAMPTZ;

ALTER TABLE market_signal_engine.evidence_signals
  ADD COLUMN IF NOT EXISTS signal_candle_timestamp TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_opportunities_signal_candle_timestamp
  ON market_signal_engine.opportunities (ticker, timeframe, signal_candle_timestamp DESC)
  WHERE signal_candle_timestamp IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_logical_identity
  ON market_signal_engine.signals (
    ticker,
    timeframe,
    signal_candle_timestamp,
    strategy_version,
    signal_type
  )
  WHERE signal_candle_timestamp IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_signals_logical_identity
  ON market_signal_engine.evidence_signals (
    ticker,
    timeframe,
    signal_candle_timestamp,
    strategy_version,
    signal_type
  )
  WHERE signal_candle_timestamp IS NOT NULL;
