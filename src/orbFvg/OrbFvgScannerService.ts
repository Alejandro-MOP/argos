import type { Candle } from '../models/Candle';
import {
  ORB_FVG_EXPERIMENT_VERSION,
  type OrbFvgResearchState,
  type OrbFvgSignalSnapshot,
} from '../models/OrbFvgSignal';
import type { MarketSymbol } from '../models/MarketSymbol';
import type { OrbFvgSignalRepository } from '../ports/OrbFvgSignalRepository';
import type { TelegramClient } from '../clients/TelegramClient';
import type { HistoricalMarketDataProvider } from '../services/MarketDataService';
import type { MarketUniverseService } from '../services/MarketUniverseService';
import type { EngineConfigService } from '../services/EngineConfigService';
import {
  calculateOpeningRangeSizePct,
  detectBreakout,
  detectFvg,
  findOpeningRangeCandle,
  roundPercent,
  roundPrice,
  toCandleSnapshot,
} from './OrbFvgMath';
import { OrbFvgSessionService } from './OrbFvgSessionService';
import { formatOrbFvgSetupPreviewAlert, formatOrbFvgTradeReadyAlert } from './OrbFvgTelegramFormatter';

const ONE_MINUTE_MS = 60_000;
const SETUP_TIMEFRAME = '5m';
const SETUP_CANDLE_MS = 5 * ONE_MINUTE_MS;
const SETUP_CANDLE_PUBLICATION_DELAY_MS = 15_000;
const ORB_FVG_DETECTION_MODE = 'LONG_ONLY_RETEST_STRUCTURE_CONFIRMATION';
const TERMINAL_SETUP_STATES: OrbFvgResearchState[] = ['TRADE_READY', 'EXPIRED_SETUP', 'INVALIDATED_SETUP'];

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
  retestsDetected: number;
  structureBreaksDetected: number;
  tradeReady: number;
  expiredSetups: number;
  persisted: number;
  duplicates: number;
  stateUpdates: number;
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
      engineConfigService?: Pick<EngineConfigService, 'loadSnapshot'>;
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
    const tradeReadyAlertsEnabled = await this.areTradeReadyAlertsEnabled(logger);
    logger.log(`[ORB-FVG] telegramAlerts=${tradeReadyAlertsEnabled ? 'SETUP_PREVIEW_AND_TRADE_READY' : 'DISABLED'} researchCollection=ACTIVE`);
    logger.log(
      `[ORB-FVG scanner] cycle start experimentVersion=${ORB_FVG_EXPERIMENT_VERSION} setupTimeframe=${SETUP_TIMEFRAME} mode=${ORB_FVG_DETECTION_MODE}`,
    );

    if (!window) {
      metrics.marketClosed = 1;
      metrics.durationMs = Date.now() - startedAt;
      logger.log(`[ORB-FVG scanner] market-closed durationMs=${metrics.durationMs}`);
      return metrics;
    }

    if (!sessionService.isRegularSessionActive(window, now)) {
      await this.expireOpenSetups(window.sessionDate, now, metrics, logger);
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
          tradeReadyAlertsEnabled,
        );
      } catch (error) {
        metrics.errors += 1;
        logger.error(`[ORB-FVG scanner] symbol failed ticker=${symbol.symbol}`, error);
      }
    }

    metrics.durationMs = Date.now() - startedAt;
    logger.log(
      `[ORB-FVG scanner] eligible=${metrics.eligible} openingRangeReady=${metrics.openingRangeReady} waiting=${metrics.waitingForOpeningRange} breakouts=${metrics.breakoutsDetected} fvgConfirmed=${metrics.fvgConfirmed} retests=${metrics.retestsDetected} structureBreaks=${metrics.structureBreaksDetected} tradeReady=${metrics.tradeReady} expiredSetups=${metrics.expiredSetups} persisted=${metrics.persisted} duplicates=${metrics.duplicates} stateUpdates=${metrics.stateUpdates} telegramAlertsSent=${metrics.telegramAlertsSent} errors=${metrics.errors} durationMs=${metrics.durationMs}`,
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
    tradeReadyAlertsEnabled: boolean,
  ): Promise<void> {
    metrics.marketDataRequests += 1;
    const candles = await this.dependencies.marketDataService.getHistoricalCandles(
      symbol.providerSymbol,
      SETUP_TIMEFRAME,
      new Date(recentSetupCandleStart.getTime() - 3 * SETUP_CANDLE_MS),
      now,
      { minimumCandles: 0 },
    );
    const recentStructure = getRecentClosedStructure(candles, recentSetupCandleStart, now);

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

    const activeSetups = await this.dependencies.repository.find({
      sessionDate,
      ticker: symbol.symbol,
      experimentVersion: ORB_FVG_EXPERIMENT_VERSION,
      status: 'OPEN',
      limit: 20,
    });
    const latestCandle = recentStructure.at(-1);
    if (latestCandle) {
      for (const { signal } of activeSetups) {
        if (TERMINAL_SETUP_STATES.includes(signal.orbFvgState ?? 'TRADE_READY')) {
          continue;
        }
        await this.advanceSetup(signal, latestCandle, now, metrics, tradeReadyAlertsEnabled);
      }
    }

    await this.detectNewFvgSetup(symbol, openingRange, sessionDate, recentStructure, now, metrics);
  }

  private async detectNewFvgSetup(
    symbol: MarketSymbol,
    openingRange: Candle,
    sessionDate: string,
    recentStructure: Candle[],
    now: Date,
    metrics: OrbFvgScannerMetrics,
  ): Promise<void> {
    const fvgCandles = recentStructure.slice(-3);
    if (fvgCandles.length < 3) {
      return;
    }
    const fvg = detectFvg(fvgCandles[0], fvgCandles[1], fvgCandles[2]);
    if (fvg?.direction !== 'LONG') {
      return;
    }

    for (const [breakoutIndex, candle] of fvgCandles.entries()) {
      const breakout = detectBreakout(openingRange.high, openingRange.low, candle);
      if (!breakout || breakout.direction !== 'LONG') {
        continue;
      }
      const absoluteBreakoutIndex = recentStructure.findIndex(
        (item) => item.timestamp.getTime() === candle.timestamp.getTime(),
      );
      const previousBreakoutCandle = absoluteBreakoutIndex > 0 ? recentStructure[absoluteBreakoutIndex - 1] : undefined;
      metrics.breakoutsDetected += 1;
      metrics.fvgConfirmed += 1;
      const signal = this.buildFvgSetup(
        symbol,
        sessionDate,
        openingRange,
        breakout,
        { ...fvg, candlesAfterBreakout: 2 - breakoutIndex, previousBreakoutCandle },
        now,
      );
      const saved = await this.dependencies.repository.saveIfNotDuplicate(signal, []);
      if (!saved.inserted) {
        metrics.duplicates += 1;
        continue;
      }
      metrics.persisted += 1;
    }
  }

  private async advanceSetup(
    signal: OrbFvgSignalSnapshot,
    candle: Candle,
    now: Date,
    metrics: OrbFvgScannerMetrics,
    tradeReadyAlertsEnabled: boolean,
  ): Promise<void> {
    const state = signal.orbFvgState ?? 'TRADE_READY';
    if (state === 'FVG_CREATED' || state === 'WAITING_FOR_RETEST') {
      if (candle.timestamp.getTime() <= signal.fvgCandle3.timestamp.getTime()) {
        return;
      }
      if (intersectsFvg(signal, candle)) {
        await this.updateSetup({
          ...signal,
          orbFvgState: 'FVG_RETESTED',
          retestCount: (signal.retestCount ?? 0) + 1,
          firstRetestAt: signal.firstRetestAt ?? candle.timestamp,
          latestRetestAt: candle.timestamp,
          retestCandleTimestamp: candle.timestamp,
          firstRetestOpen: signal.firstRetestAt ? signal.firstRetestOpen : roundPrice(candle.open),
          firstRetestHigh: signal.firstRetestAt ? signal.firstRetestHigh : roundPrice(candle.high),
          firstRetestLow: signal.firstRetestAt ? signal.firstRetestLow : roundPrice(candle.low),
          firstRetestClose: signal.firstRetestAt ? signal.firstRetestClose : roundPrice(candle.close),
          retestLow: roundPrice(candle.low),
          retestHigh: roundPrice(candle.high),
          retestClose: roundPrice(candle.close),
          retestDepthPct: calculateRetestDepthPct(signal, candle),
          scannerRunAt: now,
        }, metrics);
        metrics.retestsDetected += 1;
        return;
      }
      await this.updatePreRetraceHigh(signal, candle, now, metrics);
      return;
    }

    if (state === 'FVG_RETESTED' || state === 'WAITING_FOR_STRUCTURE_BREAK') {
      if (signal.latestRetestAt && candle.timestamp.getTime() <= signal.latestRetestAt.getTime()) {
        return;
      }
      if (intersectsFvg(signal, candle)) {
        await this.updateSetup({
          ...signal,
          orbFvgState: 'FVG_RETESTED',
          retestCount: (signal.retestCount ?? 0) + 1,
          latestRetestAt: candle.timestamp,
          retestCandleTimestamp: candle.timestamp,
          retestLow: roundPrice(candle.low),
          retestHigh: roundPrice(candle.high),
          retestClose: roundPrice(candle.close),
          retestDepthPct: calculateRetestDepthPct(signal, candle),
          scannerRunAt: now,
        }, metrics);
        metrics.retestsDetected += 1;
        return;
      }
      const preRetraceHigh = signal.preRetraceHigh;
      if (preRetraceHigh !== undefined && candle.close > preRetraceHigh) {
        const previewSignal = {
          ...signal,
          orbFvgState: 'SETUP_PREVIEW' as const,
          structureBreakCandleTimestamp: candle.timestamp,
          structureBreakOpen: roundPrice(candle.open),
          structureBreakHigh: roundPrice(candle.high),
          structureBreakLow: roundPrice(candle.low),
          structureBreakClose: roundPrice(candle.close),
          setupPreviewAt: candle.timestamp,
          setupPreviewPrice: roundPrice(candle.close),
          scannerRunAt: now,
        };
        await this.updateSetup(previewSignal, metrics);
        metrics.structureBreaksDetected += 1;
        await this.sendSetupPreviewAlertOnce(previewSignal, metrics, tradeReadyAlertsEnabled);
      }
      return;
    }

    if (state === 'PRE_RETRACE_HIGH_BROKEN' || state === 'SETUP_PREVIEW' || state === 'WAITING_FOR_CONTINUATION') {
      if (!signal.structureBreakCandleTimestamp || !signal.structureBreakClose || !signal.preRetraceHigh) {
        return;
      }
      if (candle.timestamp.getTime() <= signal.structureBreakCandleTimestamp.getTime()) {
        return;
      }
      if (candle.close > signal.preRetraceHigh && candle.close > signal.structureBreakClose) {
        const tradeReadySignal = {
          ...signal,
          orbFvgState: 'TRADE_READY' as const,
          continuationCandleTimestamp: candle.timestamp,
          continuationOpen: roundPrice(candle.open),
          continuationHigh: roundPrice(candle.high),
          continuationLow: roundPrice(candle.low),
          continuationClose: roundPrice(candle.close),
          setupReadyAt: candle.timestamp,
          tradeReadyAt: candle.timestamp,
          tradeReadyPrice: roundPrice(candle.close),
          scannerRunAt: now,
        };
        await this.updateSetup(tradeReadySignal, metrics);
        metrics.tradeReady += 1;
        await this.sendTradeReadyAlertOnce(tradeReadySignal, metrics, tradeReadyAlertsEnabled);
      }
    }
  }



  private async sendSetupPreviewAlertOnce(
    signal: OrbFvgSignalSnapshot,
    metrics: OrbFvgScannerMetrics,
    alertsEnabled: boolean,
  ): Promise<void> {
    if (!alertsEnabled || !this.dependencies.telegramClient || signal.setupPreviewAlertSent) {
      return;
    }
    await this.dependencies.telegramClient.sendMessage(formatOrbFvgSetupPreviewAlert(signal));
    await this.dependencies.repository.updateSetupState({
      ...signal,
      setupPreviewAlertSent: true,
      setupPreviewAlertedAt: signal.scannerRunAt ?? new Date(),
    });
    metrics.telegramAlertsSent += 1;
  }

  private async sendTradeReadyAlertOnce(
    signal: OrbFvgSignalSnapshot,
    metrics: OrbFvgScannerMetrics,
    tradeReadyAlertsEnabled: boolean,
  ): Promise<void> {
    if (
      !tradeReadyAlertsEnabled ||
      !this.dependencies.telegramClient ||
      signal.tradeReadyAlertSent ||
      signal.telegramAlertSent
    ) {
      return;
    }
    await this.dependencies.telegramClient.sendMessage(formatOrbFvgTradeReadyAlert(signal));
    await this.dependencies.repository.updateSetupState({
      ...signal,
      telegramAlertSent: true,
      tradeReadyAlertSent: true,
      tradeReadyAlertedAt: signal.scannerRunAt ?? new Date(),
    });
    metrics.telegramAlertsSent += 1;
  }

  private async areTradeReadyAlertsEnabled(logger: OrbFvgScannerLogger): Promise<boolean> {
    if (!this.dependencies.engineConfigService) {
      return false;
    }
    try {
      return (await this.dependencies.engineConfigService.loadSnapshot(logger)).values.orbFvgTradeReadyAlertsEnabled;
    } catch (error) {
      logger.error('[ORB-FVG scanner] could not load trade-ready alert flag; keeping ORB-FVG Telegram disabled', error);
      return false;
    }
  }

  private async updatePreRetraceHigh(
    signal: OrbFvgSignalSnapshot,
    candle: Candle,
    now: Date,
    metrics: OrbFvgScannerMetrics,
  ): Promise<void> {
    const currentHigh = signal.preRetraceHigh ?? signal.fvgCandle3.high;
    if (candle.high <= currentHigh) {
      return;
    }
    await this.updateSetup({
      ...signal,
      preRetraceHigh: roundPrice(candle.high),
      preRetraceHighTimestamp: candle.timestamp,
      scannerRunAt: now,
    }, metrics);
  }

  private async expireOpenSetups(
    sessionDate: string,
    now: Date,
    metrics: OrbFvgScannerMetrics,
    logger: OrbFvgScannerLogger,
  ): Promise<void> {
    const activeSetups = await this.dependencies.repository.find({
      sessionDate,
      experimentVersion: ORB_FVG_EXPERIMENT_VERSION,
      status: 'OPEN',
      limit: 500,
    });
    for (const { signal } of activeSetups) {
      if (TERMINAL_SETUP_STATES.includes(signal.orbFvgState ?? 'TRADE_READY')) {
        continue;
      }
      await this.updateSetup({ ...signal, orbFvgState: 'EXPIRED_SETUP', expiredAt: now, scannerRunAt: now }, metrics);
      metrics.expiredSetups += 1;
      logger.log(`[ORB-FVG scanner] setup expired ticker=${signal.ticker} sessionDate=${signal.sessionDate} state=${signal.orbFvgState}`);
    }
  }

  private async updateSetup(
    signal: OrbFvgSignalSnapshot,
    metrics: OrbFvgScannerMetrics,
  ): Promise<void> {
    await this.dependencies.repository.updateSetupState(signal);
    metrics.stateUpdates += 1;
  }

  private buildFvgSetup(
    symbol: MarketSymbol,
    sessionDate: string,
    openingRange: Candle,
    breakout: NonNullable<ReturnType<typeof detectBreakout>>,
    fvg: NonNullable<ReturnType<typeof detectFvg>> & { candlesAfterBreakout: number; previousBreakoutCandle?: Candle },
    now: Date,
  ): OrbFvgSignalSnapshot {
    const referencePrice = roundPrice(fvg.candle3.close);
    const fvgMidpoint = roundPrice((fvg.fvgLow + fvg.fvgHigh) / 2);

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
      previousBreakoutCandle: fvg.previousBreakoutCandle ? toCandleSnapshot(fvg.previousBreakoutCandle) : undefined,
      breakoutDistancePct: breakout.breakoutDistancePct,
      wickBreakout: breakout.wickBreakout,
      closeBreakout: breakout.closeBreakout,
      fvgCandle1: toCandleSnapshot(fvg.candle1),
      fvgCandle2: toCandleSnapshot(fvg.candle2),
      fvgCandle3: toCandleSnapshot(fvg.candle3),
      fvgLow: fvg.fvgLow,
      fvgHigh: fvg.fvgHigh,
      fvgMidpoint,
      fvgSizePct: fvg.fvgSizePct,
      candlesAfterBreakout: fvg.candlesAfterBreakout,
      signalAt: fvg.candle3.timestamp,
      orbFvgState: 'FVG_CREATED',
      setupTimeframe: SETUP_TIMEFRAME,
      scannerRunAt: now,
      detectedAt: now,
      detectionLagSeconds: Math.max(
        0,
        Math.round((now.getTime() - breakout.candle.timestamp.getTime()) / 1000),
      ),
      retestCount: 0,
      preRetraceHigh: roundPrice(fvg.candle3.high),
      preRetraceHighTimestamp: fvg.candle3.timestamp,
      status: 'OPEN',
      highestPriceSeen: referencePrice,
      lowestPriceSeen: referencePrice,
      mfePct: 0,
      maePct: 0,
      maxR: 0,
      setupPreviewAlertSent: false,
      tradeReadyAlertSent: false,
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
      retestsDetected: 0,
      structureBreaksDetected: 0,
      tradeReady: 0,
      expiredSetups: 0,
      persisted: 0,
      duplicates: 0,
      stateUpdates: 0,
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

const getRecentClosedStructure = (candles: Candle[], recentSetupCandleStart: Date, now: Date): Candle[] => candles
  .filter((candle) => candle.timestamp.getTime() >= recentSetupCandleStart.getTime() - 3 * SETUP_CANDLE_MS)
  .filter((candle) => candle.timestamp.getTime() <= recentSetupCandleStart.getTime())
  .filter(
    (candle) =>
      candle.timestamp.getTime() + SETUP_CANDLE_MS + SETUP_CANDLE_PUBLICATION_DELAY_MS <=
      now.getTime(),
  )
  .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
  .slice(-4);

const intersectsFvg = (signal: OrbFvgSignalSnapshot, candle: Candle): boolean =>
  candle.low <= signal.fvgHigh && candle.high >= signal.fvgLow;

const calculateRetestDepthPct = (signal: OrbFvgSignalSnapshot, candle: Candle): number => {
  const fvgSize = signal.fvgHigh - signal.fvgLow;
  if (fvgSize <= 0) {
    return 0;
  }
  const deepestTouch = Math.min(Math.max(candle.low, signal.fvgLow), signal.fvgHigh);
  return roundPercent(((signal.fvgHigh - deepestTouch) / fvgSize) * 100);
};
