import { randomUUID } from 'crypto';
import type { BacktestOutcome } from '../models/BacktestTrade';
import type { SignalEvaluationSnapshot, SignalEvaluationStatus } from '../models/ForwardSignal';
import type { SignalEvaluationRepository } from '../ports/SignalEvaluationRepository';
import type { Queryable } from '../db/postgres';

interface SignalEvaluationRow {
  id: string;
  signal_id: string;
  outcome_tp1: BacktestOutcome | null;
  outcome_tp2: BacktestOutcome | null;
  exit_at_tp1: Date | null;
  exit_at_tp2: Date | null;
  candles_until_tp1: number | null;
  candles_until_tp2: number | null;
  max_favorable_excursion_percent: string | number | null;
  max_adverse_excursion_percent: string | number | null;
  evaluated_until: Date | null;
  status: SignalEvaluationStatus;
}

export class PostgresSignalEvaluationRepository implements SignalEvaluationRepository {
  public constructor(private readonly database: Queryable) {}

  public async findBySignalId(signalId: string): Promise<SignalEvaluationSnapshot | undefined> {
    const result = await this.database.query<SignalEvaluationRow>(
      `SELECT
        id,
        signal_id,
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
      FROM signal_evaluations
      WHERE signal_id = $1`,
      [signalId],
    );

    const row = result.rows[0];
    return row ? mapSignalEvaluationRow(row) : undefined;
  }

  public async upsert(evaluation: SignalEvaluationSnapshot): Promise<void> {
    const id = evaluation.id ?? randomUUID();

    await this.database.query(
      `INSERT INTO signal_evaluations (
        id,
        signal_id,
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
      ON CONFLICT (signal_id) DO UPDATE SET
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
        evaluation.signalId,
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
}

const mapSignalEvaluationRow = (row: SignalEvaluationRow): SignalEvaluationSnapshot => ({
  id: row.id,
  signalId: row.signal_id,
  outcomeTp1: row.outcome_tp1 ?? undefined,
  outcomeTp2: row.outcome_tp2 ?? undefined,
  exitAtTp1: row.exit_at_tp1 ?? undefined,
  exitAtTp2: row.exit_at_tp2 ?? undefined,
  candlesUntilTp1: row.candles_until_tp1 ?? undefined,
  candlesUntilTp2: row.candles_until_tp2 ?? undefined,
  maxFavorableExcursionPercent:
    row.max_favorable_excursion_percent === null ? undefined : Number(row.max_favorable_excursion_percent),
  maxAdverseExcursionPercent:
    row.max_adverse_excursion_percent === null ? undefined : Number(row.max_adverse_excursion_percent),
  evaluatedUntil: row.evaluated_until ?? undefined,
  status: row.status,
});
