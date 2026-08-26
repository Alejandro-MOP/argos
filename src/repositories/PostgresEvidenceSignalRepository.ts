import { randomUUID } from 'crypto';
import type {
  EvidenceSignalFilters,
  EvidenceSignalSnapshot,
  PersistedEvidenceSignalSnapshot,
} from '../models/EvidenceSignal';
import type { EvidenceSignalRepository } from '../ports/EvidenceSignalRepository';
import type { Queryable } from '../db/postgres';

interface EvidenceSignalRow {
  id: string;
  ticker: string;
  provider_symbol: string | null;
  timeframe: string;
  detected_at: Date;
  signal_type: PersistedEvidenceSignalSnapshot['signalType'];
  score: string | number;
  trend_score: string | number;
  volume_score: string | number;
  momentum_score: string | number;
  structure_score: string | number;
  reasons: string[];
  entry: string | number;
  technical_stop_price: string | number | null;
  financial_stop_percent: string | number;
  financial_stop_price: string | number;
  tp1_percent: string | number;
  tp1_price: string | number;
  tp2_percent: string | number;
  tp2_price: string | number;
  strategy_version: string;
  asset_type: string | null;
  sector: string | null;
  industry: string | null;
  market: string | null;
  is_operational_opportunity: boolean;
  created_at: Date;
}

export class PostgresEvidenceSignalRepository implements EvidenceSignalRepository {
  public constructor(private readonly database: Queryable) {}

  public async saveIfNotDuplicate(
    signal: EvidenceSignalSnapshot,
    duplicateWindowMinutes: number,
  ): Promise<boolean> {
    const id = signal.id ?? randomUUID();
    const result = await this.database.query(
      `INSERT INTO evidence_signals (
        id,
        ticker,
        provider_symbol,
        timeframe,
        detected_at,
        signal_type,
        score,
        trend_score,
        volume_score,
        momentum_score,
        structure_score,
        reasons,
        entry,
        technical_stop_price,
        financial_stop_percent,
        financial_stop_price,
        tp1_percent,
        tp1_price,
        tp2_percent,
        tp2_price,
        strategy_version,
        asset_type,
        sector,
        industry,
        market,
        is_operational_opportunity
      )
      SELECT
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26
      WHERE NOT EXISTS (
        SELECT 1
        FROM evidence_signals existing
        WHERE existing.ticker = $2
          AND existing.timeframe = $4
          AND existing.strategy_version = $21
          AND existing.detected_at >= $5::timestamptz - ($27::int * interval '1 minute')
          AND existing.detected_at <= $5::timestamptz + ($27::int * interval '1 minute')
      )`,
      [
        id,
        signal.ticker,
        signal.providerSymbol ?? null,
        signal.timeframe,
        signal.detectedAt,
        signal.signalType,
        signal.score,
        signal.trendScore,
        signal.volumeScore,
        signal.momentumScore,
        signal.structureScore,
        JSON.stringify(signal.reasons),
        signal.entry,
        signal.technicalStopPrice ?? null,
        signal.financialStopPercent,
        signal.financialStopPrice,
        signal.tp1Percent,
        signal.tp1Price,
        signal.tp2Percent,
        signal.tp2Price,
        signal.strategyVersion,
        signal.assetType ?? null,
        signal.sector ?? null,
        signal.industry ?? null,
        signal.market ?? null,
        signal.isOperationalOpportunity,
        duplicateWindowMinutes,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  public async findPending(filters: EvidenceSignalFilters = {}): Promise<PersistedEvidenceSignalSnapshot[]> {
    const values: unknown[] = [];
    const conditions = [
      `(evaluation.status IS NULL OR evaluation.status IN ('OPEN', 'PARTIALLY_RESOLVED'))`,
    ];

    if (filters.evidenceSignalId) {
      values.push(filters.evidenceSignalId);
      conditions.push(`signal.id = $${values.length}`);
    }

    if (filters.ticker) {
      values.push(filters.ticker.toUpperCase());
      conditions.push(`signal.ticker = $${values.length}`);
    }

    const limit = filters.limit ?? 100;
    values.push(limit);

    const result = await this.database.query<EvidenceSignalRow>(
      `SELECT
        signal.id,
        signal.ticker,
        signal.provider_symbol,
        signal.timeframe,
        signal.detected_at,
        signal.signal_type,
        signal.score,
        signal.trend_score,
        signal.volume_score,
        signal.momentum_score,
        signal.structure_score,
        signal.reasons,
        signal.entry,
        signal.technical_stop_price,
        signal.financial_stop_percent,
        signal.financial_stop_price,
        signal.tp1_percent,
        signal.tp1_price,
        signal.tp2_percent,
        signal.tp2_price,
        signal.strategy_version,
        signal.asset_type,
        signal.sector,
        signal.industry,
        signal.market,
        signal.is_operational_opportunity,
        signal.created_at
      FROM evidence_signals signal
      LEFT JOIN evidence_signal_evaluations evaluation ON evaluation.evidence_signal_id = signal.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY signal.detected_at ASC
      LIMIT $${values.length}`,
      values,
    );

    return result.rows.map(mapEvidenceSignalRow);
  }
}

export const mapEvidenceSignalRow = (row: EvidenceSignalRow): PersistedEvidenceSignalSnapshot => ({
  id: row.id,
  ticker: row.ticker,
  providerSymbol: row.provider_symbol ?? undefined,
  timeframe: row.timeframe,
  detectedAt: new Date(row.detected_at),
  signalType: row.signal_type,
  score: Number(row.score),
  trendScore: Number(row.trend_score),
  volumeScore: Number(row.volume_score),
  momentumScore: Number(row.momentum_score),
  structureScore: Number(row.structure_score),
  reasons: Array.isArray(row.reasons) ? row.reasons : [],
  entry: Number(row.entry),
  technicalStopPrice: row.technical_stop_price === null ? undefined : Number(row.technical_stop_price),
  financialStopPercent: Number(row.financial_stop_percent),
  financialStopPrice: Number(row.financial_stop_price),
  tp1Percent: Number(row.tp1_percent),
  tp1Price: Number(row.tp1_price),
  tp2Percent: Number(row.tp2_percent),
  tp2Price: Number(row.tp2_price),
  strategyVersion: row.strategy_version,
  assetType: row.asset_type ?? undefined,
  sector: row.sector ?? undefined,
  industry: row.industry ?? undefined,
  market: row.market ?? undefined,
  isOperationalOpportunity: row.is_operational_opportunity,
  createdAt: new Date(row.created_at),
});
