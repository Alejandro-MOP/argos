import { randomUUID } from 'crypto';
import type { PaperTradeLevelSnapshot, PaperTradeSnapshot, PaperTradeUserAction } from '../models/PaperTrade';
import type { PaperTradeRepository } from '../ports/PaperTradeRepository';

export class PaperTradeMemoryRepository implements PaperTradeRepository {
  private readonly trades = new Map<string, PaperTradeSnapshot>();

  public async create(trade: PaperTradeSnapshot, levels: PaperTradeLevelSnapshot[]): Promise<PaperTradeSnapshot> {
    const id = trade.id ?? randomUUID();
    const now = new Date();
    const persisted: PaperTradeSnapshot = {
      ...trade,
      id,
      createdAt: trade.createdAt ?? now,
      updatedAt: trade.updatedAt ?? now,
      levels: levels.map((level) => ({
        ...level,
        id: level.id ?? randomUUID(),
        paperTradeId: id,
        createdAt: level.createdAt ?? now,
        updatedAt: level.updatedAt ?? now,
      })),
    };
    this.trades.set(id, persisted);
    return cloneTrade(persisted);
  }

  public async findOpen(): Promise<PaperTradeSnapshot[]> {
    return [...this.trades.values()].filter((trade) => trade.status === 'OPEN').map(cloneTrade);
  }

  public async findOpenByTicker(ticker: string): Promise<PaperTradeSnapshot[]> {
    return [...this.trades.values()]
      .filter((trade) => trade.status === 'OPEN' && trade.ticker === ticker.toUpperCase())
      .map(cloneTrade);
  }

  public async findById(id: string): Promise<PaperTradeSnapshot | undefined> {
    const trade = this.trades.get(id);
    return trade ? cloneTrade(trade) : undefined;
  }

  public async updateExtremes(input: {
    paperTradeId: string;
    highestPriceSeen: number;
    lowestPriceSeen: number;
    currentMfePct: number;
    currentMaePct: number;
  }): Promise<void> {
    const trade = this.trades.get(input.paperTradeId);
    if (!trade) {
      return;
    }
    this.trades.set(input.paperTradeId, { ...trade, ...input, updatedAt: new Date() });
  }

  public async claimLevelTrigger(levelId: string, triggeredAt: Date): Promise<boolean> {
    for (const [tradeId, trade] of this.trades.entries()) {
      const level = trade.levels?.find((item) => item.id === levelId);
      if (!level || level.triggeredAt) {
        continue;
      }
      this.trades.set(tradeId, {
        ...trade,
        updatedAt: triggeredAt,
        levels: trade.levels?.map((item) =>
          item.id === levelId ? { ...item, triggeredAt, updatedAt: triggeredAt } : item,
        ),
      });
      return true;
    }
    return false;
  }

  public async recordLevelAction(levelId: string, action: PaperTradeUserAction, actionAt: Date): Promise<void> {
    for (const [tradeId, trade] of this.trades.entries()) {
      this.trades.set(tradeId, {
        ...trade,
        updatedAt: actionAt,
        levels: trade.levels?.map((item) =>
          item.id === levelId ? { ...item, userAction: action, userActionAt: actionAt, updatedAt: actionAt } : item,
        ),
      });
    }
  }

  public async close(input: {
    paperTradeId: string;
    exitPrice: number;
    exitAt: Date;
    exitReason: 'MANUAL_TELEGRAM';
  }): Promise<PaperTradeSnapshot | undefined> {
    const trade = this.trades.get(input.paperTradeId);
    if (!trade) {
      return undefined;
    }
    const closed: PaperTradeSnapshot = {
      ...trade,
      status: 'CLOSED',
      exitPrice: input.exitPrice,
      exitAt: input.exitAt,
      exitReason: input.exitReason,
      updatedAt: input.exitAt,
    };
    this.trades.set(input.paperTradeId, closed);
    return cloneTrade(closed);
  }
}

const cloneTrade = (trade: PaperTradeSnapshot): PaperTradeSnapshot => ({
  ...trade,
  levels: trade.levels?.map((level) => ({ ...level })),
});
