import type { TelegramClient } from '../clients/TelegramClient';
import type { PersistedOrbFvgSignalSnapshot } from '../models/OrbFvgSignal';
import type { OrbFvgSignalRepository } from '../ports/OrbFvgSignalRepository';
import type { HistoricalMarketDataProvider } from '../services/MarketDataService';
import { ORB_FVG_R_LEVELS } from '../models/OrbFvgSignal';
import { calculateRLevelPrice, evaluateOrbFvgOutcome } from './OrbFvgMath';
import { OrbFvgSessionService } from './OrbFvgSessionService';

export interface OrbFvgForwardMonitorLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface OrbFvgForwardMonitorMetrics {
  openSignals: number;
  marketDataRequests: number;
  levelsEvaluated: number;
  levelsTriggered: number;
  resolved: number;
  wins: number;
  losses: number;
  ambiguous: number;
  expired: number;
  telegramResolutionAlertsSent: number;
  errors: number;
  durationMs: number;
}

export class OrbFvgForwardMonitorService {
  public constructor(
    private readonly dependencies: {
      repository: OrbFvgSignalRepository;
      marketDataService: HistoricalMarketDataProvider;
      telegramClient?: Pick<TelegramClient, 'sendMessage'>;
      sessionService?: OrbFvgSessionService;
      now?: () => Date;
    },
  ) {}

  public async run(logger: OrbFvgForwardMonitorLogger = console): Promise<OrbFvgForwardMonitorMetrics> {
    const startedAt = Date.now();
    const now = this.dependencies.now?.() ?? new Date();
    const metrics = this.initialMetrics();
    logger.log('[ORB-FVG] telegramAlerts=DISABLED researchCollection=ACTIVE');
    logger.log('[ORB-FVG monitor] cycle start');

    try {
      const openSignals = await this.dependencies.repository.findOpen(200);
      metrics.openSignals = openSignals.length;

      for (const signal of openSignals) {
        try {
          await this.monitorSignal(signal, now, metrics);
        } catch (error) {
          metrics.errors += 1;
          logger.error(`[ORB-FVG monitor] signal failed id=${signal.id} ticker=${signal.ticker}`, error);
        }
      }
    } catch (error) {
      metrics.errors += 1;
      logger.error('[ORB-FVG monitor] repository unavailable', error);
    }

    metrics.durationMs = Date.now() - startedAt;
    logger.log(
      `[ORB-FVG monitor] open=${metrics.openSignals} levelsEvaluated=${metrics.levelsEvaluated} levelsTriggered=${metrics.levelsTriggered} resolved=${metrics.resolved} wins=${metrics.wins} losses=${metrics.losses} ambiguous=${metrics.ambiguous} expired=${metrics.expired} errors=${metrics.errors} durationMs=${metrics.durationMs}`,
    );
    return metrics;
  }

  private async monitorSignal(signal: PersistedOrbFvgSignalSnapshot, now: Date, metrics: OrbFvgForwardMonitorMetrics): Promise<void> {
    const sessionService = this.dependencies.sessionService ?? new OrbFvgSessionService();
    const window = sessionService.getSessionWindow(signal.sessionDate);
    const to = new Date(Math.min(now.getTime(), window.regularSessionEndsAt.getTime()));
    metrics.marketDataRequests += 1;
    const candles = await this.dependencies.marketDataService.getHistoricalCandles(
      signal.providerSymbol,
      '1m',
      signal.signalAt,
      to,
      { minimumCandles: 0 },
    );

    const evaluation = evaluateOrbFvgOutcome({
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      target2RPrice: signal.target2RPrice,
      signalAt: signal.signalAt,
      expiresAt: window.regularSessionEndsAt,
      candles,
      previousHighestPriceSeen: signal.highestPriceSeen,
      previousLowestPriceSeen: signal.lowestPriceSeen,
      now,
    });

    for (const rMultiple of ORB_FVG_R_LEVELS) {
      metrics.levelsEvaluated += 1;
      const levelPrice = calculateRLevelPrice(signal.direction, signal.entryPrice, signal.risk, rMultiple);
      const triggeredAt = findFirstLevelTouch(signal, candles, levelPrice);
      if (!triggeredAt) {
        continue;
      }
      if (await this.dependencies.repository.claimLevelTrigger(signal.id, rMultiple, triggeredAt)) {
        metrics.levelsTriggered += 1;
      }
    }

    const updated: PersistedOrbFvgSignalSnapshot = { ...signal, ...evaluation };
    await this.dependencies.repository.updateForwardState(updated);

    if (evaluation.status !== 'OPEN') {
      metrics.resolved += 1;
      if (evaluation.status === 'WIN') metrics.wins += 1;
      if (evaluation.status === 'LOSS') metrics.losses += 1;
      if (evaluation.status === 'AMBIGUOUS') metrics.ambiguous += 1;
      if (evaluation.status === 'EXPIRED') metrics.expired += 1;
    }
  }

  private initialMetrics(): OrbFvgForwardMonitorMetrics {
    return {
      openSignals: 0,
      marketDataRequests: 0,
      levelsEvaluated: 0,
      levelsTriggered: 0,
      resolved: 0,
      wins: 0,
      losses: 0,
      ambiguous: 0,
      expired: 0,
      telegramResolutionAlertsSent: 0,
      errors: 0,
      durationMs: 0,
    };
  }
}

const findFirstLevelTouch = (
  signal: PersistedOrbFvgSignalSnapshot,
  candles: Array<{ timestamp: Date; high: number; low: number }>,
  levelPrice: number,
): Date | undefined => candles
  .filter((candle) => candle.timestamp.getTime() > signal.signalAt.getTime())
  .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
  .find((candle) => signal.direction === 'LONG' ? candle.high >= levelPrice : candle.low <= levelPrice)
  ?.timestamp;

