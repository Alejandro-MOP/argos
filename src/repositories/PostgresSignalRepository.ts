import { randomUUID } from 'crypto';
import type { ForwardSignalSnapshot } from '../models/ForwardSignal';
import type { ForwardSignalRepository } from '../ports/ForwardSignalRepository';
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
        telegram_sent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19
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
      ],
    );
  }
}
