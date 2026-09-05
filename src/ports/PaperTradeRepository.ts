import type {
  PaperTradeExitReason,
  PaperTradeLevelSnapshot,
  PaperTradeSnapshot,
  PaperTradeUserAction,
} from '../models/PaperTrade';

export interface PaperTradeRepository {
  create(trade: PaperTradeSnapshot, levels: PaperTradeLevelSnapshot[]): Promise<PaperTradeSnapshot>;
  findOpen(): Promise<PaperTradeSnapshot[]>;
  findOpenByTicker(ticker: string): Promise<PaperTradeSnapshot[]>;
  findById(id: string): Promise<PaperTradeSnapshot | undefined>;
  updateExtremes(input: {
    paperTradeId: string;
    highestPriceSeen: number;
    lowestPriceSeen: number;
    currentMfePct: number;
    currentMaePct: number;
  }): Promise<void>;
  claimLevelTrigger(levelId: string, triggeredAt: Date): Promise<boolean>;
  recordLevelAction(levelId: string, action: PaperTradeUserAction, actionAt: Date): Promise<void>;
  close(input: {
    paperTradeId: string;
    exitPrice: number;
    exitAt: Date;
    exitReason: PaperTradeExitReason;
  }): Promise<PaperTradeSnapshot | undefined>;
}
