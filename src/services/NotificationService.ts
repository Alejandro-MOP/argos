import type { Signal } from '../models/Signal';
import type { Opportunity } from '../models/Opportunity';
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

  public shouldNotifyOpportunity(opportunity: Opportunity): boolean {
    return opportunity.score >= this.config.minimumScore;
  }

  public getMinimumScore(): number {
    return this.config.minimumScore;
  }

  public async sendSignal(
    signal: Signal,
    opportunity?: Opportunity,
    capital?: number,
  ): Promise<void> {
    const message = opportunity
      ? this.formatOpportunitySignal(signal, opportunity, capital)
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
  ): string {
    const reasons = this.formatReasons(opportunity.reasons);
    const tradePlan = calculateTradePlan(signal, this.config.tradePlan, capital);

    return [
      '🚨 MARKET SIGNAL',
      '',
      `🟢 Ticker: ${opportunity.ticker}`,
      `⏰ Timeframe: ${this.formatTimeframe(signal.timeframe)}`,
      `⭐ Score: ${this.formatScore(opportunity.score)}/100`,
      '',
      `📈 Trend: ${this.formatScore(opportunity.trendScore)}/25`,
      `📊 Volume: ${this.formatScore(opportunity.volumeScore)}/25`,
      `⚡ Momentum: ${this.formatScore(opportunity.momentumScore)}/25`,
      `🏗 Structure: ${this.formatScore(opportunity.structureScore)}/25`,
      '',
      '──────────────────',
      '',
      reasons,
      '',
      '──────────────────',
      '',
      this.formatInvestmentSection(signal, tradePlan),
      '',
      this.formatTargetSection(tradePlan, 'min'),
      '',
      this.formatTargetSection(tradePlan, 'max'),
      '',
      '──────────────────',
      '',
      this.formatTargetFeasibility(tradePlan),
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private formatInvestmentSection(signal: Signal, tradePlan: TradePlan | undefined): string {
    if (!tradePlan) {
      return [`💰 INVERSIÓN`, '', `Entry: ${this.formatPrice(signal.entry)}`].join('\n');
    }

    const lines = [
      '💰 INVERSIÓN',
      '',
      tradePlan.capital ? `Capital: ${this.formatMoney(tradePlan.capital)}` : '',
      `Entry: ${this.formatPrice(tradePlan.entry)}`,
      '',
      `\n🛑 STOP FINANCIERO (-${this.formatPercent(tradePlan.financialStop.percent)}%)`,
      `Precio: ${this.formatPrice(tradePlan.financialStop.price)}`,
      tradePlan.financialStop.estimatedLoss !== undefined
        ? `Pérdida estimada: -${this.formatMoney(tradePlan.financialStop.estimatedLoss)}`
        : '',
      '',
      '\n📊 STOP TÉCNICO SUGERIDO',
      `Precio: ${this.formatPrice(tradePlan.technicalStop.price)}`,
    ];

    return lines.filter(Boolean).join('\n');
  }

  private formatTargetSection(tradePlan: TradePlan | undefined, targetKey: 'min' | 'max'): string {
    if (!tradePlan) {
      return '';
    }

    const target = tradePlan.targets[targetKey];
    const icon = targetKey === 'min' ? '\n🎯' : '\n🚀';
    const label = targetKey === 'min' ? 'TAKE PROFIT' : 'TAKE PROFIT';
    const lines = [
      `${icon} ${label} +${this.formatPercent(target.percent)}%`,
      '',
      `Precio objetivo: ${this.formatPrice(target.price)}`,
      target.estimatedProfit !== undefined
        ? `Ganancia estimada: +${this.formatMoney(target.estimatedProfit)}`
        : '',
      target.endingCapital !== undefined
        ? `Capital estimado: ${this.formatMoney(target.endingCapital)}`
        : '',
    ];

    return lines.filter(Boolean).join('\n');
  }

  private formatTargetFeasibility(tradePlan: TradePlan | undefined): string {
    if (!tradePlan) {
      return '';
    }

    return `📐 Objetivo +${this.formatPercent(tradePlan.targetFeasibility.minTargetPercent)}/+${this.formatPercent(tradePlan.targetFeasibility.maxTargetPercent)}%: ${this.formatAssessment(tradePlan.targetFeasibility.assessment)}`;
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

  private formatAssessment(assessment: TradePlan['targetFeasibility']['assessment']): string {
    if (assessment === 'reasonable') {
      return 'Razonable';
    }

    if (assessment === 'aggressive') {
      return 'Agresivo';
    }

    return 'Muy agresivo';
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
