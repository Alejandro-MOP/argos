CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_evaluations_signal_id_unique
  ON market_signal_engine.signal_evaluations (signal_id);
