import type { PaperTradeLevelSnapshot, PaperTradeSnapshot, PaperTradeUserAction } from '../models/PaperTrade';
import type { PaperTradeRepository } from '../ports/PaperTradeRepository';
import type { Queryable } from '../db/postgres';

interface PaperTradeRow {
  id: string;
  evidence_signal_id: string | null;
  ticker: string;
  asset_type: 'STOCK';
  timeframe: '5m';
  score: string | number;
  entry_price: string | number;
  entry_at: Date;
  status: 'OPEN' | 'CLOSED';
  strategy_version: string;
  paper_strategy_version: string;
  reference_snapshot_date: string | Date;
  mfe_reference_pct: string | number;
  mae_reference_pct: string | number;
  current_mfe_pct: string | number;
  current_mae_pct: string | number;
  highest_price_seen: string | number;
  lowest_price_seen: string | number;
  exit_price: string | number | null;
  exit_at: Date | null;
  exit_reason: 'MANUAL_TELEGRAM' | null;
  created_at: Date;
  updated_at: Date;
}

interface PaperTradeLevelRow {
  id: string;
  paper_trade_id: string;
  type: PaperTradeLevelSnapshot['type'];
  level_pct: string | number;
  level_price: string | number;
  triggered_at: Date | null;
  user_action: PaperTradeUserAction | null;
  user_action_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresPaperTradeRepository implements PaperTradeRepository {
  public constructor(private readonly database: Queryable) {}

  public async create(trade: PaperTradeSnapshot, levels: PaperTradeLevelSnapshot[]): Promise<PaperTradeSnapshot> {
    const result = await this.database.query<PaperTradeRow>(
      `INSERT INTO paper_trades (
        evidence_signal_id,
        ticker,
        asset_type,
        timeframe,
        score,
        entry_price,
        entry_at,
        status,
        strategy_version,
        paper_strategy_version,
        reference_snapshot_date,
        mfe_reference_pct,
        mae_reference_pct,
        current_mfe_pct,
        current_mae_pct,
        highest_price_seen,
        lowest_price_seen
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17
      )
      RETURNING *`,
      [
        trade.evidenceSignalId ?? null,
        trade.ticker,
        trade.assetType,
        trade.timeframe,
        trade.score,
        trade.entryPrice,
        trade.entryAt,
        trade.status,
        trade.strategyVersion,
        trade.paperStrategyVersion,
        trade.referenceSnapshotDate,
        trade.mfeReferencePct,
        trade.maeReferencePct,
        trade.currentMfePct,
        trade.currentMaePct,
        trade.highestPriceSeen,
        trade.lowestPriceSeen,
      ],
    );
    const persisted = mapTradeRow(result.rows[0]);

    for (const level of levels) {
      await this.database.query(
        `INSERT INTO paper_trade_levels (
          paper_trade_id,
          type,
          level_pct,
          level_price
        )
        VALUES ($1, $2, $3, $4)`,
        [persisted.id, level.type, level.levelPct, level.levelPrice],
      );
    }

    return this.findById(persisted.id ?? '') as Promise<PaperTradeSnapshot>;
  }

  public async findOpen(): Promise<PaperTradeSnapshot[]> {
    return this.findTrades('trade.status = $1', ['OPEN']);
  }

  public async findOpenByTicker(ticker: string): Promise<PaperTradeSnapshot[]> {
    return this.findTrades('trade.status = $1 AND trade.ticker = $2', ['OPEN', ticker.toUpperCase()]);
  }

  public async findById(id: string): Promise<PaperTradeSnapshot | undefined> {
    const trades = await this.findTrades('trade.id = $1', [id]);
    return trades[0];
  }

  public async updateExtremes(input: {
    paperTradeId: string;
    highestPriceSeen: number;
    lowestPriceSeen: number;
    currentMfePct: number;
    currentMaePct: number;
  }): Promise<void> {
    await this.database.query(
      `UPDATE paper_trades
       SET highest_price_seen = $2,
           lowest_price_seen = $3,
           current_mfe_pct = $4,
           current_mae_pct = $5,
           updated_at = now()
       WHERE id = $1`,
      [
        input.paperTradeId,
        input.highestPriceSeen,
        input.lowestPriceSeen,
        input.currentMfePct,
        input.currentMaePct,
      ],
    );
  }

  public async claimLevelTrigger(levelId: string, triggeredAt: Date): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE paper_trade_levels
       SET triggered_at = $2,
           updated_at = $2
       WHERE id = $1
         AND triggered_at IS NULL`,
      [levelId, triggeredAt],
    );

    return (result.rowCount ?? 0) === 1;
  }

  public async recordLevelAction(levelId: string, action: PaperTradeUserAction, actionAt: Date): Promise<void> {
    await this.database.query(
      `UPDATE paper_trade_levels
       SET user_action = $2,
           user_action_at = $3,
           updated_at = $3
       WHERE id = $1`,
      [levelId, action, actionAt],
    );
  }

  public async close(input: {
    paperTradeId: string;
    exitPrice: number;
    exitAt: Date;
    exitReason: 'MANUAL_TELEGRAM';
  }): Promise<PaperTradeSnapshot | undefined> {
    await this.database.query(
      `UPDATE paper_trades
       SET status = 'CLOSED',
           exit_price = $2,
           exit_at = $3,
           exit_reason = $4,
           updated_at = $3
       WHERE id = $1
         AND status = 'OPEN'`,
      [input.paperTradeId, input.exitPrice, input.exitAt, input.exitReason],
    );

    return this.findById(input.paperTradeId);
  }

  private async findTrades(condition: string, values: unknown[]): Promise<PaperTradeSnapshot[]> {
    const result = await this.database.query<PaperTradeRow & Partial<PaperTradeLevelRow>>(
      `SELECT
        trade.*,
        level.id AS level_id,
        level.paper_trade_id AS level_paper_trade_id,
        level.type AS level_type,
        level.level_pct AS level_level_pct,
        level.level_price AS level_level_price,
        level.triggered_at AS level_triggered_at,
        level.user_action AS level_user_action,
        level.user_action_at AS level_user_action_at,
        level.created_at AS level_created_at,
        level.updated_at AS level_updated_at
      FROM paper_trades trade
      LEFT JOIN paper_trade_levels level ON level.paper_trade_id = trade.id
      WHERE ${condition}
      ORDER BY trade.created_at DESC, level.level_pct ASC`,
      values,
    );

    return groupRows(result.rows as unknown as PaperTradeJoinedRow[]);
  }
}

interface PaperTradeJoinedRow extends PaperTradeRow {
  level_id: string | null;
  level_paper_trade_id: string | null;
  level_type: PaperTradeLevelSnapshot['type'] | null;
  level_level_pct: string | number | null;
  level_level_price: string | number | null;
  level_triggered_at: Date | null;
  level_user_action: PaperTradeUserAction | null;
  level_user_action_at: Date | null;
  level_created_at: Date | null;
  level_updated_at: Date | null;
}

const groupRows = (rows: PaperTradeJoinedRow[]): PaperTradeSnapshot[] => {
  const grouped = new Map<string, PaperTradeSnapshot>();

  for (const row of rows) {
    const trade = grouped.get(row.id) ?? { ...mapTradeRow(row), levels: [] };

    if (row.level_id) {
      trade.levels?.push({
        id: row.level_id,
        paperTradeId: row.level_paper_trade_id ?? row.id,
        type: row.level_type ?? 'PROFIT_LEVEL',
        levelPct: Number(row.level_level_pct),
        levelPrice: Number(row.level_level_price),
        triggeredAt: row.level_triggered_at ?? undefined,
        userAction: row.level_user_action ?? undefined,
        userActionAt: row.level_user_action_at ?? undefined,
        createdAt: row.level_created_at ?? undefined,
        updatedAt: row.level_updated_at ?? undefined,
      });
    }

    grouped.set(row.id, trade);
  }

  return [...grouped.values()];
};

const mapTradeRow = (row: PaperTradeRow): PaperTradeSnapshot => ({
  id: row.id,
  evidenceSignalId: row.evidence_signal_id ?? undefined,
  ticker: row.ticker,
  assetType: row.asset_type,
  timeframe: row.timeframe,
  score: 100,
  entryPrice: Number(row.entry_price),
  entryAt: new Date(row.entry_at),
  status: row.status,
  strategyVersion: row.strategy_version,
  paperStrategyVersion: row.paper_strategy_version,
  referenceSnapshotDate: String(row.reference_snapshot_date).slice(0, 10),
  mfeReferencePct: Number(row.mfe_reference_pct),
  maeReferencePct: Number(row.mae_reference_pct),
  currentMfePct: Number(row.current_mfe_pct),
  currentMaePct: Number(row.current_mae_pct),
  highestPriceSeen: Number(row.highest_price_seen),
  lowestPriceSeen: Number(row.lowest_price_seen),
  exitPrice: row.exit_price === null ? undefined : Number(row.exit_price),
  exitAt: row.exit_at ?? undefined,
  exitReason: row.exit_reason ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
