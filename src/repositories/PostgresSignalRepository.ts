import { randomUUID } from 'crypto';
import type { ForwardSignalSnapshot, PersistedForwardSignalSnapshot } from '../models/ForwardSignal';
import type { ForwardSignalFilters, ForwardSignalRepository } from '../ports/ForwardSignalRepository';
import type { Queryable } from '../db/postgres';

export class PostgresSignalRepository implements ForwardSignalRepository {
  public constructor(private readonly database: Queryable) {}

  public async save(signal: ForwardSignalSnapshot): Promise<void> {
    const id = signal.id ?? randomUUID();

    await this.database.query(
      `INSERT INTO signals (
        id,
        ticker,
        timeframe,
        signal_type,
        signal_at,
        score,
        trend_score,
        volume_score,
        momentum_score,
        structure_score,
        entry,
        technical_stop_price,
        financial_stop_percent,
        financial_stop_price,
        tp1_percent,
        tp1_price,
        tp2_percent,
        tp2_price,
        telegram_sent,
        strategy_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )`,
      [
        id,
        signal.ticker,
        signal.timeframe,
        signal.signalType,
        signal.signalAt,
        signal.score,
        signal.trendScore,
        signal.volumeScore,
        signal.momentumScore,
        signal.structureScore,
        signal.entry,
        signal.technicalStopPrice ?? null,
        signal.financialStopPercent,
        signal.financialStopPrice,
        signal.tp1Percent,
        signal.tp1Price,
        signal.tp2Percent,
        signal.tp2Price,
        signal.telegramSent,
        signal.strategyVersion ?? 'legacy',
      ],
    );
  }

  public async findPending(filters: ForwardSignalFilters = {}): Promise<PersistedForwardSignalSnapshot[]> {
    const values: unknown[] = [];
    const conditions = [
      `(evaluation.status IS NULL OR evaluation.status IN ('OPEN', 'PARTIALLY_RESOLVED'))`,
    ];

    if (filters.signalId) {
      values.push(filters.signalId);
      conditions.push(`signal.id = $${values.length}`);
    }

    if (filters.ticker) {
      values.push(filters.ticker.toUpperCase());
      conditions.push(`signal.ticker = $${values.length}`);
    }

    const limit = filters.limit ?? 100;
    values.push(limit);

    const result = await this.database.query<ForwardSignalRow>(
      `SELECT
        signal.id,
        signal.ticker,
        signal.timeframe,
        signal.signal_type,
        signal.signal_at,
        signal.score,
        signal.trend_score,
        signal.volume_score,
        signal.momentum_score,
        signal.structure_score,
        signal.entry,
        signal.technical_stop_price,
        signal.financial_stop_percent,
        signal.financial_stop_price,
        signal.tp1_percent,
        signal.tp1_price,
        signal.tp2_percent,
        signal.tp2_price,
        signal.telegram_sent,
        signal.strategy_version
      FROM signals signal
      LEFT JOIN signal_evaluations evaluation ON evaluation.signal_id = signal.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY signal.signal_at ASC
      LIMIT $${values.length}`,
      values,
    );

    return result.rows.map(mapForwardSignalRow);
  }

}


interface ForwardSignalRow {
  id: string;
  ticker: string;
  timeframe: string;
  signal_type: PersistedForwardSignalSnapshot['signalType'];
  signal_at: Date;
  score: string | number;
  trend_score: string | number;
  volume_score: string | number;
  momentum_score: string | number;
  structure_score: string | number;
  entry: string | number;
  technical_stop_price: string | number | null;
  financial_stop_percent: string | number;
  financial_stop_price: string | number;
  tp1_percent: string | number;
  tp1_price: string | number;
  tp2_percent: string | number;
  tp2_price: string | number;
  telegram_sent: boolean;
  strategy_version: string | null;
}

const mapForwardSignalRow = (row: ForwardSignalRow): PersistedForwardSignalSnapshot => ({
  id: row.id,
  ticker: row.ticker,
  timeframe: row.timeframe,
  signalType: row.signal_type,
  signalAt: new Date(row.signal_at),
  score: Number(row.score),
  trendScore: Number(row.trend_score),
  volumeScore: Number(row.volume_score),
  momentumScore: Number(row.momentum_score),
  structureScore: Number(row.structure_score),
  entry: Number(row.entry),
  technicalStopPrice: row.technical_stop_price === null ? undefined : Number(row.technical_stop_price),
  financialStopPercent: Number(row.financial_stop_percent),
  financialStopPrice: Number(row.financial_stop_price),
  tp1Percent: Number(row.tp1_percent),
  tp1Price: Number(row.tp1_price),
  tp2Percent: Number(row.tp2_percent),
  tp2Price: Number(row.tp2_price),
  telegramSent: row.telegram_sent,
  strategyVersion: row.strategy_version ?? 'legacy',
});
