import type { Candle } from '../models/Candle';
import {
  ORB_FVG_EXPERIMENT_VERSION,
  ORB_FVG_R_LEVELS,
  type OrbFvgSignalSnapshot,
} from '../models/OrbFvgSignal';
import type { MarketSymbol } from '../models/MarketSymbol';
import type { OrbFvgSignalRepository } from '../ports/OrbFvgSignalRepository';
import type { TelegramClient } from '../clients/TelegramClient';
import type { HistoricalMarketDataProvider } from '../services/MarketDataService';
import type { MarketUniverseService } from '../services/MarketUniverseService';
import {
  calculateOpeningRangeSizePct,
  calculateRLevelPrice,
  calculateRiskPct,
  calculateTarget2R,
  detectBreakout,
  detectFvg,
  findOpeningRangeCandle,
  roundPrice,
  toCandleSnapshot,
} from './OrbFvgMath';
import { OrbFvgSessionService } from './OrbFvgSessionService';

const ONE_MINUTE_MS = 60_000;
const SETUP_TIMEFRAME = '5m';
const SETUP_CANDLE_MS = 5 * ONE_MINUTE_MS;
const SETUP_CANDLE_PUBLICATION_DELAY_MS = 15_000;
const ORB_FVG_DETECTION_MODE = 'LONG_ONLY';

export interface OrbFvgScannerLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface OrbFvgScannerMetrics {
  eligible: number;
  openingRangeReady: number;
  waitingForOpeningRange: number;
  marketClosed: number;
  marketDataRequests: number;
  breakoutsDetected: number;
  fvgConfirmed: number;
  persisted: number;
  duplicates: number;
  telegramAlertsSent: number;
  errors: number;
  durationMs: number;
}

export class OrbFvgScannerService {
  private readonly openingRangeCache = new Map<string, Candle>();
  private readonly processedSetupCandleCache = new Set<string>();

  public constructor(
    private readonly dependencies: {
      marketUniverseService: Pick<MarketUniverseService, 'loadSnapshot'>;
      marketDataService: HistoricalMarketDataProvider;
      repository: OrbFvgSignalRepository;
      telegramClient?: Pick<TelegramClient, 'sendMessage'>;
      sessionService?: OrbFvgSessionService;
      now?: () => Date;
    },
  ) {}

  public async run(logger: OrbFvgScannerLogger = console): Promise<OrbFvgScannerMetrics> {
    const startedAt = Date.now();
    const now = this.dependencies.now?.() ?? new Date();
    const sessionService = this.dependencies.sessionService ?? new OrbFvgSessionService();
    const window = sessionService.getCurrentSessionWindow(now);
    const metrics = this.initialMetrics();
    logger.log('[ORB-FVG] telegramAlerts=DISABLED researchCollection=ACTIVE');
    logger.log(
      `[ORB-FVG scanner] cycle start experimentVersion=${ORB_FVG_EXPERIMENT_VERSION} setupTimeframe=${SETUP_TIMEFRAME} mode=${ORB_FVG_DETECTION_MODE}`,
    );

    if (!window || !sessionService.isRegularSessionActive(window, now)) {
      metrics.marketClosed = 1;
      metrics.durationMs = Date.now() - startedAt;
      logger.log(`[ORB-FVG scanner] market-closed durationMs=${metrics.durationMs}`);
      return metrics;
    }

    if (!sessionService.isAfterOpeningRange(window, now)) {
      metrics.waitingForOpeningRange = 1;
      metrics.durationMs = Date.now() - startedAt;
      logger.log(`[ORB-FVG scanner] waiting-for-opening-range durationMs=${metrics.durationMs}`);
      return metrics;
    }

    const recentSetupCandleStart = getRecentCompletedSetupCandleStart(now);
    if (!recentSetupCandleStart || recentSetupCandleStart.getTime() < window.endsAt.getTime()) {
      metrics.waitingForOpeningRange = 1;
      metrics.durationMs = Date.now() - startedAt;
      logger.log(
        `[ORB-FVG scanner] waiting-for-closed-${SETUP_TIMEFRAME}-structure durationMs=${metrics.durationMs}`,
      );
      return metrics;
    }

    const universe = await this.dependencies.marketUniverseService.loadSnapshot(logger);
    const symbols = universe.symbols.filter(isEligibleSymbol);
    metrics.eligible = symbols.length;

    for (const symbol of symbols) {
      const processedKey = `${symbol.symbol}:${window.sessionDate}:${recentSetupCandleStart.toISOString()}`;
      if (this.processedSetupCandleCache.has(processedKey)) {
        continue;
      }
      this.processedSetupCandleCache.add(processedKey);

      try {
        const openingRange = await this.getOpeningRange(symbol, window, now, metrics);
        if (!openingRange) {
          metrics.waitingForOpeningRange += 1;
          continue;
        }
        metrics.openingRangeReady += 1;
        await this.scanSymbol(
          symbol,
          openingRange,
          window.sessionDate,
          recentSetupCandleStart,
          now,
          metrics,
          logger,
        );
      } catch (error) {
        metrics.errors += 1;
        logger.error(`[ORB-FVG scanner] symbol failed ticker=${symbol.symbol}`, error);
      }
    }

    metrics.durationMs = Date.now() - startedAt;
    logger.log(
      `[ORB-FVG scanner] eligible=${metrics.eligible} openingRangeReady=${metrics.openingRangeReady} waiting=${metrics.waitingForOpeningRange} breakouts=${metrics.breakoutsDetected} fvgConfirmed=${metrics.fvgConfirmed} persisted=${metrics.persisted} duplicates=${metrics.duplicates} telegramAlertsSent=${metrics.telegramAlertsSent} errors=${metrics.errors} durationMs=${metrics.durationMs}`,
    );
    return metrics;
  }

  private async getOpeningRange(
    symbol: MarketSymbol,
    window: ReturnType<OrbFvgSessionService['getSessionWindow']>,
    now: Date,
    metrics: OrbFvgScannerMetrics,
  ): Promise<Candle | undefined> {
    const key = `${symbol.symbol}:${window.sessionDate}`;
    const cached = this.openingRangeCache.get(key);
    if (cached) {
      return cached;
    }

    metrics.marketDataRequests += 1;
    const candles = await this.dependencies.marketDataService.getHistoricalCandles(
      symbol.providerSymbol,
      '15m',
      window.startsAt,
      new Date(window.endsAt.getTime() + ONE_MINUTE_MS),
      { minimumCandles: 0 },
    );
    const openingRange = findOpeningRangeCandle(candles, window, now);
    if (openingRange) {
      this.openingRangeCache.set(key, openingRange);
    }
    return openingRange;
  }

  private async scanSymbol(
    symbol: MarketSymbol,
    openingRange: Candle,
    sessionDate: string,
    recentSetupCandleStart: Date,
    now: Date,
    metrics: OrbFvgScannerMetrics,
    logger: OrbFvgScannerLogger,
  ): Promise<void> {
    metrics.marketDataRequests += 1;
    const candles = await this.dependencies.marketDataService.getHistoricalCandles(
      symbol.providerSymbol,
      SETUP_TIMEFRAME,
      new Date(recentSetupCandleStart.getTime() - 2 * SETUP_CANDLE_MS),
      now,
      { minimumCandles: 0 },
    );
    const recentStructure = candles
      .filter(
        (candle) =>
          candle.timestamp.getTime() >= recentSetupCandleStart.getTime() - 2 * SETUP_CANDLE_MS,
      )
      .filter((candle) => candle.timestamp.getTime() <= recentSetupCandleStart.getTime())
      .filter(
        (candle) =>
          candle.timestamp.getTime() + SETUP_CANDLE_MS + SETUP_CANDLE_PUBLICATION_DELAY_MS <=
          now.getTime(),
      )
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
      .slice(-3);

    if (
      recentStructure.length < 3 ||
      recentStructure.at(-1)?.timestamp.getTime() !== recentSetupCandleStart.getTime()
    ) {
      metrics.waitingForOpeningRange += 1;
      logger.log(
        `[ORB-FVG scanner] waiting-for-complete-${SETUP_TIMEFRAME}-structure ticker=${symbol.symbol} recentSetupCandle=${recentSetupCandleStart.toISOString()} candles=${recentStructure.length}`,
      );
      return;
    }

    const fvg = detectFvg(recentStructure[0], recentStructure[1], recentStructure[2]);
    if (fvg?.direction !== 'LONG') {
      return;
    }

    for (const [breakoutIndex, candle] of recentStructure.entries()) {
      const breakout = detectBreakout(openingRange.high, openingRange.low, candle);
      if (!breakout || breakout.direction !== 'LONG') {
        continue;
      }
      metrics.breakoutsDetected += 1;
      metrics.fvgConfirmed += 1;
      const signal = this.buildSignal(
        symbol,
        sessionDate,
        openingRange,
        breakout,
        { ...fvg, candlesAfterBreakout: 2 - breakoutIndex },
        now,
      );
      if (!signal) {
        continue;
      }
      const levels = ORB_FVG_R_LEVELS.map((rMultiple) => ({
        orbFvgSignalId: signal.id ?? '',
        rMultiple,
        levelPrice: calculateRLevelPrice(
          signal.direction,
          signal.entryPrice,
          signal.risk,
          rMultiple,
        ),
      }));
      const saved = await this.dependencies.repository.saveIfNotDuplicate(signal, levels);
      if (!saved.inserted || !saved.signal) {
        metrics.duplicates += 1;
        continue;
      }
      metrics.persisted += 1;
    }
  }

  private buildSignal(
    symbol: MarketSymbol,
    sessionDate: string,
    openingRange: Candle,
    breakout: NonNullable<ReturnType<typeof detectBreakout>>,
    fvg: NonNullable<ReturnType<typeof detectFvg>> & { candlesAfterBreakout: number },
    now: Date,
  ): OrbFvgSignalSnapshot | undefined {
    const entryPrice = roundPrice(fvg.candle3.close);
    const stopPrice = roundPrice(
      breakout.direction === 'LONG' ? breakout.candle.low : breakout.candle.high,
    );
    const risk = roundPrice(Math.abs(entryPrice - stopPrice));
    if (!Number.isFinite(risk) || risk <= 0) {
      return undefined;
    }
    const target2RPrice = calculateTarget2R(breakout.direction, entryPrice, risk);
    if (target2RPrice <= 0) {
      return undefined;
    }

    return {
      experimentVersion: ORB_FVG_EXPERIMENT_VERSION,
      ticker: symbol.symbol,
      providerSymbol: symbol.providerSymbol,
      assetType: symbol.assetType as 'STOCK' | 'ETF',
      sector: symbol.sector,
      industry: symbol.industry,
      market: symbol.market,
      exchange: symbol.exchange,
      sessionDate,
      direction: breakout.direction,
      openingRangeCandle: toCandleSnapshot(openingRange),
      openingRangeSizePct: calculateOpeningRangeSizePct(openingRange.high, openingRange.low),
      breakoutAt: breakout.candle.timestamp,
      breakoutCandle: toCandleSnapshot(breakout.candle),
      breakoutDistancePct: breakout.breakoutDistancePct,
      wickBreakout: breakout.wickBreakout,
      closeBreakout: breakout.closeBreakout,
      fvgCandle1: toCandleSnapshot(fvg.candle1),
      fvgCandle2: toCandleSnapshot(fvg.candle2),
      fvgCandle3: toCandleSnapshot(fvg.candle3),
      fvgLow: fvg.fvgLow,
      fvgHigh: fvg.fvgHigh,
      fvgSizePct: fvg.fvgSizePct,
      candlesAfterBreakout: fvg.candlesAfterBreakout,
      signalAt: fvg.candle3.timestamp,
      setupTimeframe: SETUP_TIMEFRAME,
      scannerRunAt: now,
      detectedAt: now,
      detectionLagSeconds: Math.max(
        0,
        Math.round((now.getTime() - breakout.candle.timestamp.getTime()) / 1000),
      ),
      entryPrice,
      stopPrice,
      risk,
      riskPct: calculateRiskPct(risk, entryPrice),
      target2RPrice,
      status: 'OPEN',
      highestPriceSeen: entryPrice,
      lowestPriceSeen: entryPrice,
      mfePct: 0,
      maePct: 0,
      maxR: 0,
      telegramAlertSent: false,
    };
  }

  private initialMetrics(): OrbFvgScannerMetrics {
    return {
      eligible: 0,
      openingRangeReady: 0,
      waitingForOpeningRange: 0,
      marketClosed: 0,
      marketDataRequests: 0,
      breakoutsDetected: 0,
      fvgConfirmed: 0,
      persisted: 0,
      duplicates: 0,
      telegramAlertsSent: 0,
      errors: 0,
      durationMs: 0,
    };
  }
}

const isEligibleSymbol = (symbol: MarketSymbol): boolean =>
  (symbol.assetType === 'STOCK' || symbol.assetType === 'ETF') &&
  symbol.sessionType === 'US_REGULAR' &&
  symbol.supportsIntraday &&
  symbol.isActive;

const getRecentCompletedSetupCandleStart = (now: Date): Date | undefined => {
  const adjustedTimestamp = now.getTime() - SETUP_CANDLE_PUBLICATION_DELAY_MS;
  const recentClose = Math.floor(adjustedTimestamp / SETUP_CANDLE_MS) * SETUP_CANDLE_MS;
  const recentStart = recentClose - SETUP_CANDLE_MS;
  return recentStart > 0 ? new Date(recentStart) : undefined;
};
