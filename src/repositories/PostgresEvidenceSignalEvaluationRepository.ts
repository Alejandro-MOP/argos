import { randomUUID } from 'crypto';
import type { BacktestOutcome } from '../models/BacktestTrade';
import type {
  EvidenceSignalEvaluationSnapshot,
  EvidenceTargetEvaluationSnapshot,
} from '../models/EvidenceSignal';
import type { SignalEvaluationStatus } from '../models/ForwardSignal';
import type { EvidenceSignalEvaluationRepository } from '../ports/EvidenceSignalEvaluationRepository';
import type { Queryable } from '../db/postgres';

export class PostgresEvidenceSignalEvaluationRepository implements EvidenceSignalEvaluationRepository {
  public constructor(private readonly database: Queryable) {}

  public async upsert(evaluation: EvidenceSignalEvaluationSnapshot): Promise<void> {
    const id = evaluation.id ?? randomUUID();

    await this.database.query(
      `INSERT INTO evidence_signal_evaluations (
        id,
        evidence_signal_id,
        outcome_tp1,
        outcome_tp2,
        exit_at_tp1,
        exit_at_tp2,
        candles_until_tp1,
        candles_until_tp2,
        max_favorable_excursion_percent,
        max_adverse_excursion_percent,
        evaluated_until,
        status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (evidence_signal_id) DO UPDATE SET
        outcome_tp1 = EXCLUDED.outcome_tp1,
        outcome_tp2 = EXCLUDED.outcome_tp2,
        exit_at_tp1 = EXCLUDED.exit_at_tp1,
        exit_at_tp2 = EXCLUDED.exit_at_tp2,
        candles_until_tp1 = EXCLUDED.candles_until_tp1,
        candles_until_tp2 = EXCLUDED.candles_until_tp2,
        max_favorable_excursion_percent = EXCLUDED.max_favorable_excursion_percent,
        max_adverse_excursion_percent = EXCLUDED.max_adverse_excursion_percent,
        evaluated_until = EXCLUDED.evaluated_until,
        status = EXCLUDED.status,
        updated_at = now()`,
      [
        id,
        evaluation.evidenceSignalId,
        evaluation.outcomeTp1 ?? null,
        evaluation.outcomeTp2 ?? null,
        evaluation.exitAtTp1 ?? null,
        evaluation.exitAtTp2 ?? null,
        evaluation.candlesUntilTp1 ?? null,
        evaluation.candlesUntilTp2 ?? null,
        evaluation.maxFavorableExcursionPercent ?? null,
        evaluation.maxAdverseExcursionPercent ?? null,
        evaluation.evaluatedUntil ?? null,
        evaluation.status,
      ],
    );
  }

  public async upsertTargetEvaluations(targets: EvidenceTargetEvaluationSnapshot[]): Promise<void> {
    for (const target of targets) {
      const id = target.id ?? randomUUID();
      await this.database.query(
        `INSERT INTO evidence_target_evaluations (
          id,
          evidence_signal_id,
          target_percent,
          target_price,
          outcome,
          hit_at,
          candles_until
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (evidence_signal_id, target_percent) DO UPDATE SET
          target_price = EXCLUDED.target_price,
          outcome = EXCLUDED.outcome,
          hit_at = EXCLUDED.hit_at,
          candles_until = EXCLUDED.candles_until,
          updated_at = now()`,
        [
          id,
          target.evidenceSignalId,
          target.targetPercent,
          target.targetPrice,
          target.outcome ?? null,
          target.hitAt ?? null,
          target.candlesUntil ?? null,
        ],
      );
    }
  }
}

export interface EvidenceEvaluationPerformanceRow {
  score: number | string;
  timeframe: string;
  ticker: string;
  asset_type: string | null;
  sector: string | null;
  industry: string | null;
  strategy_version: string;
  financial_stop_percent: number | string;
  outcome_tp1: BacktestOutcome | null;
  outcome_tp2: BacktestOutcome | null;
  max_favorable_excursion_percent: number | string | null;
  max_adverse_excursion_percent: number | string | null;
  status: SignalEvaluationStatus | null;
}
