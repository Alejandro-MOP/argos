import type { Signal } from '../models/Signal';
import type { Opportunity } from '../models/Opportunity';
import type { SignalContext, PerformanceSummary } from '../models/SignalContext';
import type { TelegramClient } from '../clients/TelegramClient';
import {
  calculateTradePlan,
  getPriceDecimals,
  type TradePlan,
  type TradePlanConfig,
} from '../utils/tradeSizing.utils';

export interface NotificationServiceConfig {
  minimumScore: number;
  tradePlan: TradePlanConfig;
}

const DEFAULT_NOTIFICATION_CONFIG: NotificationServiceConfig = {
  minimumScore: 80,
  tradePlan: { stopLossPercent: 1, targetMinPercent: 2, targetMaxPercent: 3 },
};

const SEPARATOR = '────────────────────';

export class NotificationService {
  private readonly config: NotificationServiceConfig;

  public constructor(
    private readonly telegramClient?: TelegramClient,
    config: Partial<NotificationServiceConfig> = {},
  ) {
    this.config = {
      minimumScore: config.minimumScore ?? DEFAULT_NOTIFICATION_CONFIG.minimumScore,
      tradePlan: config.tradePlan ?? DEFAULT_NOTIFICATION_CONFIG.tradePlan,
    };
  }

  public shouldNotifyOpportunity(opportunity: Opportunity, minimumScore = this.config.minimumScore): boolean {
    return opportunity.score >= minimumScore;
  }

  public getMinimumScore(): number {
    return this.config.minimumScore;
  }

  public async sendSignal(
    signal: Signal,
    opportunity?: Opportunity,
    capital?: number,
    context?: SignalContext,
  ): Promise<void> {
    const message = opportunity
      ? this.formatOpportunitySignal(signal, opportunity, capital, context)
      : [
          `Señal ${signal.signalType}: ${signal.ticker}`,
          `Temporalidad: ${this.formatTimeframe(signal.timeframe)}`,
          `Entrada: ${this.formatPrice(signal.entry)}`,
          this.formatCompactTradePlan(signal, capital),
          `Score: ${this.formatScore(signal.score)}`,
        ]
          .filter(Boolean)
          .join(' | ');

    await this.sendMessage(message);
  }

  public async sendMessage(message: string): Promise<void> {
    if (this.telegramClient && (await this.telegramClient.sendMessage(message))) {
      return;
    }

    console.log(message);
  }

  private formatOpportunitySignal(
    signal: Signal,
    opportunity: Opportunity,
    capital?: number,
    context?: SignalContext,
  ): string {
    const tradePlan = calculateTradePlan(signal, this.config.tradePlan, capital);
    const sections = [
      this.formatCurrentSetup(signal, opportunity),
      this.formatReasons(opportunity.reasons),
      this.formatTradePlan(signal, tradePlan),
      this.formatHistoricalPerformance(opportunity, context),
      this.formatForwardPerformance(context),
    ].filter((section): section is string => Boolean(section));

    return sections.join(`\n\n${SEPARATOR}\n\n`);
  }

  private formatCurrentSetup(signal: Signal, opportunity: Opportunity): string {
    return [
      '🚨 MARKET SIGNAL',
      '',
      `🟢 ${opportunity.ticker} · ${this.formatTimeframe(signal.timeframe)}`,
      `⭐ Score: ${this.formatScore(opportunity.score)}/100`,
      '',
      `📈 Trend: ${this.formatScore(opportunity.trendScore)}/25`,
      `📊 Volume: ${this.formatScore(opportunity.volumeScore)}/25`,
      `⚡ Momentum: ${this.formatScore(opportunity.momentumScore)}/25`,
      `🏗 Structure: ${this.formatScore(opportunity.structureScore)}/25`,
    ].join('\n');
  }

  private formatTradePlan(signal: Signal, tradePlan: TradePlan | undefined): string {
    if (!tradePlan) {
      return ['💰 TRADE PLAN', '', `Entry: ${this.formatPrice(signal.entry)}`].join('\n');
    }

    const lines = [
      '💰 TRADE PLAN',
      '',
      tradePlan.capital ? `Capital: ${this.formatMoney(tradePlan.capital)}` : '',
      `Entry: ${this.formatPrice(tradePlan.entry)}`,
      '',
      `🛑 -${this.formatPercent(tradePlan.financialStop.percent)}% → ${this.formatPrice(tradePlan.financialStop.price)}`,
      tradePlan.financialStop.estimatedLoss !== undefined
        ? `Pérdida estimada: -${this.formatMoney(tradePlan.financialStop.estimatedLoss)}`
        : '',
      '',
      `🎯 +${this.formatPercent(tradePlan.targets.min.percent)}% → ${this.formatPrice(tradePlan.targets.min.price)}`,
      tradePlan.targets.min.estimatedProfit !== undefined
        ? `Ganancia estimada: +${this.formatMoney(tradePlan.targets.min.estimatedProfit)}`
        : '',
      '',
      `🚀 +${this.formatPercent(tradePlan.targets.max.percent)}% → ${this.formatPrice(tradePlan.targets.max.price)}`,
      tradePlan.targets.max.estimatedProfit !== undefined
        ? `Ganancia estimada: +${this.formatMoney(tradePlan.targets.max.estimatedProfit)}`
        : '',
    ];

    return lines.filter((line) => line !== '').join('\n');
  }

  private formatHistoricalPerformance(
    opportunity: Opportunity,
    context?: SignalContext,
  ): string | undefined {
    if (!context?.historicalEnabled) {
      return undefined;
    }

    const summary = context.historical;

    if (!summary || summary.sampleSize === 0) {
      return ['📊 BACKTEST', 'Datos históricos insuficientes'].join('\n');
    }

    return [
      '📊 BACKTEST',
      `${opportunity.ticker} · ${this.formatTimeframe(opportunity.timeframe)} · Score ≥${this.formatScore(this.config.minimumScore)}`,
      '',
      `${summary.sampleSize} casos históricos`,
      summary.insufficientData ? '⚠️ Muestra pequeña' : '',
      '',
      this.formatTargetPerformance('🎯', 'TP', summary.tp1),
      this.formatTargetPerformance('🚀', 'TP', summary.tp2),
      '',
      summary.averageMfePercent !== undefined
        ? `📈 MFE promedio: ${this.formatSignedPercent(summary.averageMfePercent)}`
        : '',
      summary.averageMaePercent !== undefined
        ? `📉 MAE promedio: ${this.formatSignedPercent(summary.averageMaePercent)}`
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private formatForwardPerformance(context?: SignalContext): string | undefined {
    if (!context?.forwardEnabled) {
      return undefined;
    }

    const summary = context.forward;

    if (!summary || summary.sampleSize === 0) {
      return ['🧪 FORWARD TEST', 'Pendiente de recopilar señales reales'].join('\n');
    }

    return [
      '🧪 FORWARD TEST',
      'Alertas reales del bot',
      '',
      `${summary.sampleSize} señales registradas`,
      summary.insufficientData ? '⚠️ Muestra pequeña' : '',
      '',
      this.formatTargetPerformance('🎯', 'TP', summary.tp1),
      this.formatTargetPerformance('🚀', 'TP', summary.tp2),
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private formatTargetPerformance(
    icon: string,
    label: string,
    target: PerformanceSummary['tp1'],
  ): string {
    const winRate = target.winRate === null ? 'n/a' : `${this.formatPercent(target.winRate)}%`;

    return `${icon} ${label} +${this.formatPercent(target.targetPercent)}%: ${winRate}`;
  }

  private formatCompactTradePlan(signal: Signal, capital?: number): string {
    const tradePlan = calculateTradePlan(signal, this.config.tradePlan, capital);

    if (!tradePlan) {
      return '';
    }

    return [
      `Stop -${this.formatPercent(tradePlan.financialStop.percent)}%: ${this.formatPrice(tradePlan.financialStop.price)}`,
      `Target +${this.formatPercent(tradePlan.targets.min.percent)}%: ${this.formatPrice(tradePlan.targets.min.price)}`,
      `Target +${this.formatPercent(tradePlan.targets.max.percent)}%: ${this.formatPrice(tradePlan.targets.max.price)}`,
    ].join(' | ');
  }

  private formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatPrice(value: number): string {
    return `$${value.toFixed(getPriceDecimals(value))}`;
  }

  private formatPercent(value: number): string {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  }

  private formatSignedPercent(value: number): string {
    const prefix = value > 0 ? '+' : '';

    return `${prefix}${this.formatPercent(value)}%`;
  }

  private formatScore(value: number): string {
    return value.toFixed(0);
  }

  private formatTimeframe(timeframe: string): string {
    return timeframe.trim().toLowerCase();
  }

  private formatReasons(reasons: string[]): string {
    if (reasons.length === 0) {
      return 'Sin razones registradas.';
    }

    return reasons.map((reason) => `✅ ${reason}`).join('\n');
  }
}
