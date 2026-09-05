import type { PaperTradeLevelSnapshot, PaperTradeMonitorMetrics, PaperTradeSnapshot } from '../models/PaperTrade';
import type { PaperTradeRepository } from '../ports/PaperTradeRepository';
import type { TelegramClient } from '../clients/TelegramClient';
import type { MarketDataService } from './MarketDataService';

export interface PaperTradeMonitorLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

const initialMetrics = (): PaperTradeMonitorMetrics => ({
  openTrades: 0,
  uniqueTickers: 0,
  pricesFetched: 0,
  levelsEvaluated: 0,
  levelsTriggered: 0,
  telegramAlertsSent: 0,
  errors: 0,
  durationMs: 0,
});

export class PaperTradeMonitorService {
  public constructor(
    private readonly repository: PaperTradeRepository,
    private readonly marketDataService: Pick<MarketDataService, 'getCandles'>,
    private readonly telegramClient?: Pick<TelegramClient, 'sendMessage'>,
  ) {}

  public async run(logger: PaperTradeMonitorLogger = console): Promise<PaperTradeMonitorMetrics> {
    const startedAt = Date.now();
    const metrics = initialMetrics();

    try {
      const openTrades = await this.repository.findOpen();
      metrics.openTrades = openTrades.length;
      const prices = await this.fetchPrices(openTrades, metrics, logger);

      for (const trade of openTrades) {
        const currentPrice = prices.get(trade.ticker);
        if (!currentPrice) {
          continue;
        }

        try {
          await this.processTrade(trade, currentPrice, metrics);
        } catch (error) {
          metrics.errors += 1;
          logger.error(`[PaperTradeMonitor] failed trade=${trade.id ?? 'n/a'} ticker=${trade.ticker}`, error);
        }
      }
    } catch (error) {
      metrics.errors += 1;
      logger.error('[PaperTradeMonitor] repository unavailable; skipping paper trade monitor cycle', error);
    } finally {
      metrics.durationMs = Date.now() - startedAt;
      logger.log(
        [
          '[PaperTradeMonitor] completed',
          `openTrades=${metrics.openTrades}`,
          `uniqueTickers=${metrics.uniqueTickers}`,
          `pricesFetched=${metrics.pricesFetched}`,
          `levelsEvaluated=${metrics.levelsEvaluated}`,
          `levelsTriggered=${metrics.levelsTriggered}`,
          `telegramAlertsSent=${metrics.telegramAlertsSent}`,
          `errors=${metrics.errors}`,
          `durationMs=${metrics.durationMs}`,
        ].join(' '),
      );
    }

    return metrics;
  }

  private async fetchPrices(
    trades: PaperTradeSnapshot[],
    metrics: PaperTradeMonitorMetrics,
    logger: PaperTradeMonitorLogger,
  ): Promise<Map<string, number>> {
    const tickers = [...new Set(trades.map((trade) => trade.ticker))];
    metrics.uniqueTickers = tickers.length;
    const prices = new Map<string, number>();

    for (const ticker of tickers) {
      try {
        const candles = await this.marketDataService.getCandles(ticker, '5m', 1);
        const latest = candles.at(-1);
        if (latest) {
          prices.set(ticker, latest.close);
          metrics.pricesFetched += 1;
        }
      } catch (error) {
        metrics.errors += 1;
        logger.error(`[PaperTradeMonitor] price fetch failed ticker=${ticker}`, error);
      }
    }

    return prices;
  }

  private async processTrade(
    trade: PaperTradeSnapshot,
    currentPrice: number,
    metrics: PaperTradeMonitorMetrics,
  ): Promise<void> {
    const highestPriceSeen = Math.max(trade.highestPriceSeen, currentPrice);
    const lowestPriceSeen = Math.min(trade.lowestPriceSeen, currentPrice);
    const currentMfePct = percentMove(highestPriceSeen, trade.entryPrice);
    const currentMaePct = percentMove(lowestPriceSeen, trade.entryPrice);

    await this.repository.updateExtremes({
      paperTradeId: trade.id ?? '',
      highestPriceSeen,
      lowestPriceSeen,
      currentMfePct,
      currentMaePct,
    });

    for (const level of trade.levels ?? []) {
      if (level.triggeredAt) {
        continue;
      }

      metrics.levelsEvaluated += 1;
      if (!hasCrossedLevel(currentPrice, level)) {
        continue;
      }

      const triggeredAt = new Date();
      const claimed = await this.repository.claimLevelTrigger(level.id ?? '', triggeredAt);
      if (!claimed) {
        continue;
      }

      metrics.levelsTriggered += 1;
      if (this.telegramClient) {
        await this.telegramClient.sendMessage(
          formatPaperLevelAlert(trade, level, currentPrice, currentMfePct, currentMaePct),
        );
        metrics.telegramAlertsSent += 1;
      }
    }
  }
}

export const hasCrossedLevel = (currentPrice: number, level: PaperTradeLevelSnapshot): boolean =>
  level.levelPct >= 0 ? currentPrice >= level.levelPrice : currentPrice <= level.levelPrice;

export const percentMove = (price: number, entryPrice: number): number =>
  round(((price - entryPrice) / entryPrice) * 100, 2);

const formatPaperLevelAlert = (
  trade: PaperTradeSnapshot,
  level: PaperTradeLevelSnapshot,
  currentPrice: number,
  currentMfePct: number,
  currentMaePct: number,
): string => {
  const favorable = level.levelPct >= 0;

  return [
    favorable ? '🟢 ARGOS PAPER ALERT' : '🔴 ARGOS PAPER ALERT',
    '',
    favorable
      ? `${trade.ticker} alcanzó una zona favorable.`
      : `${trade.ticker} alcanzó la zona adversa de referencia.`,
    '',
    `Entrada: ${formatPrice(trade.entryPrice)}`,
    `Actual: ${formatPrice(currentPrice)}`,
    `Movimiento: ${formatSignedPercent(percentMove(currentPrice, trade.entryPrice))}`,
    '',
    `MFE actual: ${formatSignedPercent(currentMfePct)}`,
    `MAE actual: ${formatSignedPercent(currentMaePct)}`,
    '',
    'Referencia:',
    level.type === 'REFERENCE_FAVORABLE'
      ? `MFE mediano STOCK · 5m · Score100 = ${formatSignedPercent(trade.mfeReferencePct)}`
      : level.type === 'REFERENCE_ADVERSE'
        ? `MAE mediano STOCK · 5m · Score100 = ${formatSignedPercent(trade.maeReferencePct)}`
        : `Nivel de seguimiento ${formatSignedPercent(level.levelPct)}`,
    '',
    'Revisa la gráfica y decide desde el Control Bot: continuar o cerrar.',
    '',
    `Paper trade: ${trade.id ?? 'n/a'}`,
    `Nivel: ${level.id ?? 'n/a'}`,
  ].join('\n');
};

const formatPrice = (value: number): string => `$${value.toFixed(value < 1 ? 6 : 2)}`;
const formatSignedPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
