import { readFileSync } from 'fs';
import path from 'path';

describe('historical Evidence deduplication migration', () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), 'migrations/008_add_evidence_research_exclusion.sql'),
    'utf8',
  );

  it('adds non-destructive research eligibility metadata only to raw Evidence', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS excluded_from_research BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS duplicate_classification TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS canonical_evidence_signal_id UUID');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false');
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+market_signal_engine\.evidence_signal_evaluations/i);
    expect(sql).not.toMatch(/UPDATE\s+market_signal_engine\.evidence_target_evaluations/i);
    expect(sql).not.toMatch(/signal_candle_timestamp\s*=/i);
  });

  it('guards the approved historical repair set before marking records', () => {
    expect(sql).toContain('high_confidence_expected INTEGER := 13');
    expect(sql).toContain('possible_expected INTEGER := 2');
    expect(sql).toContain('HIGH_CONFIDENCE_DUPLICATE');
    expect(sql).toContain('POSSIBLE_DUPLICATE');
    expect(sql).toContain('review_required = true');
    expect(sql).toContain('excluded_from_research = true');
  });
});
