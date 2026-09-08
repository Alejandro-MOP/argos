CREATE TABLE IF NOT EXISTS market_signal_engine.orb_fvg_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_version TEXT NOT NULL,
  ticker TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  market TEXT,
  exchange TEXT,
  session_date DATE NOT NULL,
  direction TEXT NOT NULL,
  opening_range_candle_timestamp TIMESTAMPTZ NOT NULL,
  opening_range_open NUMERIC NOT NULL,
  opening_range_high NUMERIC NOT NULL,
  opening_range_low NUMERIC NOT NULL,
  opening_range_close NUMERIC NOT NULL,
  opening_range_size_pct NUMERIC NOT NULL,
  breakout_at TIMESTAMPTZ NOT NULL,
  breakout_candle_timestamp TIMESTAMPTZ NOT NULL,
  breakout_open NUMERIC NOT NULL,
  breakout_high NUMERIC NOT NULL,
  breakout_low NUMERIC NOT NULL,
  breakout_close NUMERIC NOT NULL,
  breakout_distance_pct NUMERIC NOT NULL,
  wick_breakout BOOLEAN NOT NULL,
  close_breakout BOOLEAN NOT NULL,
  fvg_candle1_timestamp TIMESTAMPTZ NOT NULL,
  fvg_candle1_open NUMERIC NOT NULL,
  fvg_candle1_high NUMERIC NOT NULL,
  fvg_candle1_low NUMERIC NOT NULL,
  fvg_candle1_close NUMERIC NOT NULL,
  fvg_candle2_timestamp TIMESTAMPTZ NOT NULL,
  fvg_candle2_open NUMERIC NOT NULL,
  fvg_candle2_high NUMERIC NOT NULL,
  fvg_candle2_low NUMERIC NOT NULL,
  fvg_candle2_close NUMERIC NOT NULL,
  fvg_candle3_timestamp TIMESTAMPTZ NOT NULL,
  fvg_candle3_open NUMERIC NOT NULL,
  fvg_candle3_high NUMERIC NOT NULL,
  fvg_candle3_low NUMERIC NOT NULL,
  fvg_candle3_close NUMERIC NOT NULL,
  fvg_low NUMERIC NOT NULL,
  fvg_high NUMERIC NOT NULL,
  fvg_size_pct NUMERIC NOT NULL,
  candles_after_breakout INTEGER NOT NULL,
  signal_at TIMESTAMPTZ NOT NULL,
  entry_price NUMERIC NOT NULL,
  stop_price NUMERIC NOT NULL,
  risk NUMERIC NOT NULL,
  risk_pct NUMERIC NOT NULL,
  target_2r_price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  outcome TEXT,
  highest_price_seen NUMERIC NOT NULL,
  lowest_price_seen NUMERIC NOT NULL,
  mfe_pct NUMERIC NOT NULL DEFAULT 0,
  mae_pct NUMERIC NOT NULL DEFAULT 0,
  max_r NUMERIC NOT NULL DEFAULT 0,
  target_reached_at TIMESTAMPTZ,
  stop_reached_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  telegram_alert_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orb_fvg_signals_asset_type_check CHECK (asset_type IN ('STOCK', 'ETF')),
  CONSTRAINT orb_fvg_signals_direction_check CHECK (direction IN ('LONG', 'SHORT')),
  CONSTRAINT orb_fvg_signals_status_check CHECK (status IN ('OPEN', 'WIN', 'LOSS', 'AMBIGUOUS', 'EXPIRED')),
  CONSTRAINT orb_fvg_signals_outcome_check CHECK (outcome IS NULL OR outcome IN ('WIN', 'LOSS', 'AMBIGUOUS', 'EXPIRED')),
  CONSTRAINT orb_fvg_signals_risk_check CHECK (risk > 0),
  UNIQUE (ticker, session_date, direction, experiment_version, breakout_candle_timestamp)
);

CREATE TABLE IF NOT EXISTS market_signal_engine.orb_fvg_signal_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orb_fvg_signal_id UUID NOT NULL REFERENCES market_signal_engine.orb_fvg_signals(id) ON DELETE CASCADE,
  r_multiple NUMERIC NOT NULL,
  level_price NUMERIC NOT NULL,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (orb_fvg_signal_id, r_multiple)
);

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_session_date
  ON market_signal_engine.orb_fvg_signals (session_date DESC);

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_status_signal_at
  ON market_signal_engine.orb_fvg_signals (status, signal_at ASC);

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_dimensions
  ON market_signal_engine.orb_fvg_signals (asset_type, direction, experiment_version, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signal_levels_signal_id
  ON market_signal_engine.orb_fvg_signal_levels (orb_fvg_signal_id);

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signal_levels_triggered_at
  ON market_signal_engine.orb_fvg_signal_levels (triggered_at);

