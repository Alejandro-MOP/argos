ALTER TABLE market_signal_engine.evidence_signals
  ADD COLUMN IF NOT EXISTS excluded_from_research BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_classification TEXT,
  ADD COLUMN IF NOT EXISTS canonical_evidence_signal_id UUID,
  ADD COLUMN IF NOT EXISTS deduplication_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduplicated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evidence_signals_duplicate_classification_check'
      AND conrelid = 'market_signal_engine.evidence_signals'::regclass
  ) THEN
    ALTER TABLE market_signal_engine.evidence_signals
      ADD CONSTRAINT evidence_signals_duplicate_classification_check
      CHECK (
        duplicate_classification IS NULL
        OR duplicate_classification IN (
          'HIGH_CONFIDENCE_DUPLICATE',
          'POSSIBLE_DUPLICATE',
          'DISTINCT',
          'UNKNOWN'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evidence_signals_canonical_evidence_signal_id_fkey'
      AND conrelid = 'market_signal_engine.evidence_signals'::regclass
  ) THEN
    ALTER TABLE market_signal_engine.evidence_signals
      ADD CONSTRAINT evidence_signals_canonical_evidence_signal_id_fkey
      FOREIGN KEY (canonical_evidence_signal_id)
      REFERENCES market_signal_engine.evidence_signals(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidence_signals_research_eligible
  ON market_signal_engine.evidence_signals (strategy_version, score, detected_at DESC)
  WHERE excluded_from_research = false;

CREATE INDEX IF NOT EXISTS idx_evidence_signals_review_required
  ON market_signal_engine.evidence_signals (review_required, duplicate_classification)
  WHERE review_required = true;

DO $$
DECLARE
  high_confidence_expected INTEGER := 13;
  possible_expected INTEGER := 2;
  high_confidence_found INTEGER;
  possible_found INTEGER;
BEGIN
  WITH high_confidence(id, canonical_id, reason) AS (
    VALUES
      ('9c0ba8aa-4986-48b0-acf9-8296ba27fe28'::uuid, '006c79f9-38a2-4d9e-925c-ea82a24e7ee3'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol255'),
      ('9f4b6a9b-cf17-46d7-a472-8adbfa3e63c7'::uuid, '006c79f9-38a2-4d9e-925c-ea82a24e7ee3'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol255'),
      ('b9aef778-4520-4b33-b8d6-42f0984037fe'::uuid, 'fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol256'),
      ('e6675d58-c9fa-498a-9cf5-c77d066740c1'::uuid, 'fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol256'),
      ('26353bbc-67be-43e9-ae07-4a20d80bae8f'::uuid, 'fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol256'),
      ('08971dde-72a2-4803-b076-1815d57453d1'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('319d4d73-f46d-41aa-b66c-4a342c6f4d04'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('48560d14-182b-435e-96d9-511cda63e890'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('fa69c9fc-3ccd-461e-af49-fc7be4dd9033'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('8c1c4008-4721-4c9b-9313-cafa260f8443'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256'),
      ('00bca21d-4565-4fda-90aa-583680abb656'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256'),
      ('af96b86a-f92f-4119-97ae-2028f9ced3e9'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256'),
      ('43dd29ec-80d4-4b31-b96c-c957ea49597a'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256')
  ),
  possible(id, canonical_id, reason) AS (
    VALUES
      ('fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, '006c79f9-38a2-4d9e-925c-ea82a24e7ee3'::uuid, 'same-core-market-snapshot-but-reasons-differ-vol255-vs-vol256'),
      ('df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, '8a86182f-3889-45fb-9085-67e8d15c9c2a'::uuid, 'same-core-market-snapshot-but-reasons-differ-vol154-vs-vol155')
  )
  SELECT
    (SELECT COUNT(*) FROM high_confidence candidate JOIN market_signal_engine.evidence_signals signal ON signal.id = candidate.id),
    (SELECT COUNT(*) FROM possible candidate JOIN market_signal_engine.evidence_signals signal ON signal.id = candidate.id)
  INTO high_confidence_found, possible_found;

  IF high_confidence_found = 0 AND possible_found = 0 THEN
    RAISE NOTICE 'Historical evidence deduplication skipped: approved legacy records not present.';
    RETURN;
  END IF;

  IF high_confidence_found != high_confidence_expected OR possible_found != possible_expected THEN
    RAISE EXCEPTION
      'Historical evidence deduplication aborted: expected % high confidence and % possible, found % high confidence and % possible.',
      high_confidence_expected,
      possible_expected,
      high_confidence_found,
      possible_found;
  END IF;

  WITH high_confidence(id, canonical_id, reason) AS (
    VALUES
      ('9c0ba8aa-4986-48b0-acf9-8296ba27fe28'::uuid, '006c79f9-38a2-4d9e-925c-ea82a24e7ee3'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol255'),
      ('9f4b6a9b-cf17-46d7-a472-8adbfa3e63c7'::uuid, '006c79f9-38a2-4d9e-925c-ea82a24e7ee3'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol255'),
      ('b9aef778-4520-4b33-b8d6-42f0984037fe'::uuid, 'fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol256'),
      ('e6675d58-c9fa-498a-9cf5-c77d066740c1'::uuid, 'fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol256'),
      ('26353bbc-67be-43e9-ae07-4a20d80bae8f'::uuid, 'fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, 'same-market-snapshot-nvda-1d-2026-08-27-vol256'),
      ('08971dde-72a2-4803-b076-1815d57453d1'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('319d4d73-f46d-41aa-b66c-4a342c6f4d04'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('48560d14-182b-435e-96d9-511cda63e890'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('fa69c9fc-3ccd-461e-af49-fc7be4dd9033'::uuid, 'df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol155'),
      ('8c1c4008-4721-4c9b-9313-cafa260f8443'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256'),
      ('00bca21d-4565-4fda-90aa-583680abb656'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256'),
      ('af96b86a-f92f-4119-97ae-2028f9ced3e9'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256'),
      ('43dd29ec-80d4-4b31-b96c-c957ea49597a'::uuid, '8d2fd63f-40e9-4653-a283-9d854adc1ace'::uuid, 'same-market-snapshot-nvda-1d-2026-08-28-vol256')
  )
  UPDATE market_signal_engine.evidence_signals signal
  SET
    excluded_from_research = true,
    duplicate_classification = 'HIGH_CONFIDENCE_DUPLICATE',
    canonical_evidence_signal_id = high_confidence.canonical_id,
    deduplication_reason = high_confidence.reason,
    review_required = false,
    deduplicated_at = now()
  FROM high_confidence
  WHERE signal.id = high_confidence.id;

  WITH possible(id, canonical_id, reason) AS (
    VALUES
      ('fd29ef98-9989-466b-9bf1-beb9ec9de9c6'::uuid, '006c79f9-38a2-4d9e-925c-ea82a24e7ee3'::uuid, 'same-core-market-snapshot-but-reasons-differ-vol255-vs-vol256'),
      ('df23adbe-be12-4cbf-a0bb-05a7c8a32798'::uuid, '8a86182f-3889-45fb-9085-67e8d15c9c2a'::uuid, 'same-core-market-snapshot-but-reasons-differ-vol154-vs-vol155')
  )
  UPDATE market_signal_engine.evidence_signals signal
  SET
    excluded_from_research = false,
    duplicate_classification = 'POSSIBLE_DUPLICATE',
    canonical_evidence_signal_id = possible.canonical_id,
    deduplication_reason = possible.reason,
    review_required = true,
    deduplicated_at = now()
  FROM possible
  WHERE signal.id = possible.id;
END $$;
