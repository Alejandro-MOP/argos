import type {
  CreatePaperTradeInput,
  PaperTradeLevelSnapshot,
  PaperTradeSnapshot,
} from '../models/PaperTrade';
import type { PaperTradeRepository } from '../ports/PaperTradeRepository';
import type { MarketDataService } from './MarketDataService';
import { PAPER_STRATEGY_V0_1, isPaperStrategyV01Eligible } from './PaperStrategyConfig';

export type PaperTradeRegistrationMode = 'current-price' | 'manual-price';

export class PaperTradeServiceError extends Error {
  public constructor(public readonly code: 'not-eligible' | 'invalid-entry-price' | 'market-data-unavailable' | 'trade-not-found') {
    super(code);
    this.name = 'PaperTradeServiceError';
  }
}

export class PaperTradeService {
  public constructor(
    private readonly repository: PaperTradeRepository,
    private readonly marketDataService: Pick<MarketDataService, 'getCandles'>,
  ) {}

  public isEligible(input: Omit<CreatePaperTradeInput, 'entryPrice'> & { signalType?: string }): boolean {
    return isPaperStrategyV01Eligible(input);
  }

  public async getCurrentPrice(ticker: string): Promise<number> {
    try {
      const candles = await this.marketDataService.getCandles(ticker.toUpperCase(), PAPER_STRATEGY_V0_1.timeframe, 1);
      const latest = candles.at(-1);
      if (!latest || !Number.isFinite(latest.close)) {
        throw new Error('missing-latest-candle');
      }
      return latest.close;
    } catch {
      throw new PaperTradeServiceError('market-data-unavailable');
    }
  }

  public async createOpenTrade(input: CreatePaperTradeInput): Promise<PaperTradeSnapshot> {
    if (!isPaperStrategyV01Eligible(input)) {
      throw new PaperTradeServiceError('not-eligible');
    }

    if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) {
      throw new PaperTradeServiceError('invalid-entry-price');
    }

    const entryAt = input.entryAt ?? new Date();
    const trade: PaperTradeSnapshot = {
      evidenceSignalId: input.evidenceSignalId,
      ticker: input.ticker.toUpperCase(),
      assetType: PAPER_STRATEGY_V0_1.assetType,
      timeframe: PAPER_STRATEGY_V0_1.timeframe,
      score: PAPER_STRATEGY_V0_1.score,
      entryPrice: input.entryPrice,
      entryAt,
      status: 'OPEN',
      strategyVersion: PAPER_STRATEGY_V0_1.strategyVersion,
      paperStrategyVersion: PAPER_STRATEGY_V0_1.paperStrategyVersion,
      referenceSnapshotDate: PAPER_STRATEGY_V0_1.referenceSnapshotDate,
      mfeReferencePct: PAPER_STRATEGY_V0_1.mfeReferencePct,
      maeReferencePct: PAPER_STRATEGY_V0_1.maeReferencePct,
      currentMfePct: 0,
      currentMaePct: 0,
      highestPriceSeen: input.entryPrice,
      lowestPriceSeen: input.entryPrice,
    };

    return this.repository.create(trade, buildInitialLevels(input.entryPrice));
  }

  public async listOpenTrades(): Promise<PaperTradeSnapshot[]> {
    return this.repository.findOpen();
  }

  public async closeTradeWithCurrentPrice(paperTradeId: string, exitAt = new Date()): Promise<PaperTradeSnapshot> {
    const trade = await this.repository.findById(paperTradeId);
    if (!trade) {
      throw new PaperTradeServiceError('trade-not-found');
    }

    const exitPrice = await this.getCurrentPrice(trade.ticker);
    return this.closeTrade(paperTradeId, exitPrice, exitAt);
  }

  public async closeTrade(paperTradeId: string, exitPrice: number, exitAt = new Date()): Promise<PaperTradeSnapshot> {
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      throw new PaperTradeServiceError('invalid-entry-price');
    }

    const trade = await this.repository.close({
      paperTradeId,
      exitPrice,
      exitAt,
      exitReason: 'MANUAL_TELEGRAM',
    });

    if (!trade) {
      throw new PaperTradeServiceError('trade-not-found');
    }

    return trade;
  }

  public async continueFromLevel(levelId: string, actionAt = new Date()): Promise<void> {
    await this.repository.recordLevelAction(levelId, 'CONTINUE', actionAt);
  }
}

export const buildInitialLevels = (entryPrice: number): PaperTradeLevelSnapshot[] => [
  {
    type: 'REFERENCE_FAVORABLE',
    levelPct: PAPER_STRATEGY_V0_1.mfeReferencePct,
    levelPrice: priceFromPercent(entryPrice, PAPER_STRATEGY_V0_1.mfeReferencePct),
  },
  {
    type: 'REFERENCE_ADVERSE',
    levelPct: PAPER_STRATEGY_V0_1.maeReferencePct,
    levelPrice: priceFromPercent(entryPrice, PAPER_STRATEGY_V0_1.maeReferencePct),
  },
  ...PAPER_STRATEGY_V0_1.favorableFollowUpLevelsPct.map((levelPct) => ({
    type: 'PROFIT_LEVEL' as const,
    levelPct,
    levelPrice: priceFromPercent(entryPrice, levelPct),
  })),
];

export const priceFromPercent = (entryPrice: number, percent: number): number =>
  round(entryPrice * (1 + percent / 100), 6);

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
