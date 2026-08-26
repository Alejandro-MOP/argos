import type { Opportunity } from '../models/Opportunity';
import type { OpportunityRepository } from '../ports/OpportunityRepository';
import type { Queryable } from '../db/postgres';

interface OpportunityRow {
  ticker: string;
  timeframe: string;
  detected_at: Date;
  score: string | number;
  trend_score: string | number;
  volume_score: string | number;
  momentum_score: string | number;
  structure_score: string | number;
  reasons: string[];
  strategy_version: string | null;
}

export class PostgresOpportunityRepository implements OpportunityRepository {
  public constructor(private readonly database: Queryable) {}

  public async save(opportunity: Opportunity): Promise<void> {
    await this.database.query(
      `INSERT INTO opportunities (
        ticker,
        timeframe,
        detected_at,
        score,
        trend_score,
        volume_score,
        momentum_score,
        structure_score,
        reasons,
        strategy_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        opportunity.ticker,
        opportunity.timeframe,
        opportunity.detectedAt,
        opportunity.score,
        opportunity.trendScore,
        opportunity.volumeScore,
        opportunity.momentumScore,
        opportunity.structureScore,
        JSON.stringify(opportunity.reasons),
        opportunity.strategyVersion ?? 'legacy',
      ],
    );
  }

  public async findAll(): Promise<Opportunity[]> {
    const result = await this.database.query<OpportunityRow>(
      `SELECT
        ticker,
        timeframe,
        detected_at,
        score,
        trend_score,
        volume_score,
        momentum_score,
        structure_score,
        reasons,
        strategy_version
      FROM opportunities
      ORDER BY detected_at DESC`,
    );

    return result.rows.map(mapOpportunityRow);
  }

  public async findRecentByTicker(
    ticker: string,
    timeframe: string,
    since: Date,
  ): Promise<Opportunity[]> {
    const result = await this.database.query<OpportunityRow>(
      `SELECT
        ticker,
        timeframe,
        detected_at,
        score,
        trend_score,
        volume_score,
        momentum_score,
        structure_score,
        reasons,
        strategy_version
      FROM opportunities
      WHERE ticker = $1
        AND timeframe = $2
        AND detected_at >= $3
      ORDER BY detected_at DESC`,
      [ticker, timeframe, since],
    );

    return result.rows.map(mapOpportunityRow);
  }
}

const mapOpportunityRow = (row: OpportunityRow): Opportunity => ({
  ticker: row.ticker,
  timeframe: row.timeframe,
  detectedAt: new Date(row.detected_at),
  score: Number(row.score),
  trendScore: Number(row.trend_score),
  volumeScore: Number(row.volume_score),
  momentumScore: Number(row.momentum_score),
  structureScore: Number(row.structure_score),
  reasons: Array.isArray(row.reasons) ? row.reasons : [],
  strategyVersion: row.strategy_version ?? 'legacy',
});
