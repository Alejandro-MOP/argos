CREATE SCHEMA IF NOT EXISTS market_signal_engine;

DO $$
BEGIN
  IF to_regclass('public.opportunities') IS NOT NULL
     AND to_regclass('market_signal_engine.opportunities') IS NULL THEN
    ALTER TABLE public.opportunities SET SCHEMA market_signal_engine;
  END IF;

  IF to_regclass('public.signals') IS NOT NULL
     AND to_regclass('market_signal_engine.signals') IS NULL THEN
    ALTER TABLE public.signals SET SCHEMA market_signal_engine;
  END IF;

  IF to_regclass('public.signal_evaluations') IS NOT NULL
     AND to_regclass('market_signal_engine.signal_evaluations') IS NULL THEN
    ALTER TABLE public.signal_evaluations SET SCHEMA market_signal_engine;
  END IF;
END $$;

DROP TABLE IF EXISTS public.schema_migrations;
