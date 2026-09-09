ALTER TABLE market_signal_engine.orb_fvg_signals
  ADD COLUMN IF NOT EXISTS setup_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS scanner_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detection_lag_seconds INTEGER;

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_experiment_setup_timeframe
  ON market_signal_engine.orb_fvg_signals (experiment_version, setup_timeframe, session_date DESC);
