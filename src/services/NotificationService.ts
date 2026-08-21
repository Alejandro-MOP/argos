import type { Signal } from '../models/Signal';
import type { Opportunity } from '../models/Opportunity';
import type { TelegramClient } from '../clients/TelegramClient';
import { calculateTradeSizing } from '../utils/tradeSizing.utils';

export interface NotificationServiceConfig {
  minimumScore: number;
}

export class NotificationService {
  public constructor(
    private readonly telegramClient?: TelegramClient,
    private readonly config: NotificationServiceConfig = { minimumScore: 80 },
  ) {}

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
          `Stop: ${this.formatPrice(signal.stop)}`,
          `Objetivo: ${this.formatPrice(signal.target)}`,
          `Score: ${this.formatScore(signal.score)}`,
          this.formatPositionSizing(signal, capital),
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
    const positionSizing = this.formatPositionSizing(signal, capital);

    return [
      '🚨 MARKET SIGNAL',
      '',
      `🟢 Ticker: ${opportunity.ticker}`,
      `⏰ Timeframe: ${this.formatTimeframe(signal.timeframe)}`,
      '',
      `⭐ Score: ${this.formatScore(opportunity.score)}/100`,
      '',
      `📈 Trend: ${this.formatScore(opportunity.trendScore)}/25`,
      `📊 Volume: ${this.formatScore(opportunity.volumeScore)}/25`,
      `⚡ Momentum: ${this.formatScore(opportunity.momentumScore)}/25`,
      `🏗 Structure: ${this.formatScore(opportunity.structureScore)}/25`,
      '',
      '────────────────────',
      '',
      reasons,
      '',
      '────────────────────',
      '',
      `💵 Entry: ${this.formatPrice(signal.entry)}`,
      `🛑 Stop: ${this.formatPrice(signal.stop)}`,
      `🎯 Target: ${this.formatPrice(signal.target)}`,
      '',
      `⚖️ Risk/Reward: ${this.formatRiskReward(signal)}`,
      ...(positionSizing ? ['', '────────────────────', '', positionSizing] : []),
    ].join('\n');
  }

  private formatPositionSizing(signal: Signal, capital?: number): string {
    const positionSizing = calculateTradeSizing(signal, capital ?? 0);

    if (!positionSizing) {
      return '';
    }

    return [
      `💰 Capital: ${this.formatPrice(positionSizing.capital)}`,
      `📉 Pérdida estimada: ${this.formatPrice(positionSizing.estimatedLoss)}`,
      `📈 Ganancia estimada: ${this.formatPrice(positionSizing.estimatedProfit)}`,
    ].join('\n');
  }

  private formatRiskReward(signal: Signal): string {
    const risk = Math.abs(signal.entry - signal.stop);
    const reward = Math.abs(signal.target - signal.entry);

    if (risk <= 0) {
      return 'n/a';
    }

    return `1:${(reward / risk).toFixed(2)}`;
  }

  private formatPrice(value: number): string {
    return value.toFixed(2);
  }

  private formatScore(value: number): string {
    return value.toFixed(0);
  }

  private formatTimeframe(timeframe: string): string {
    return timeframe.toUpperCase();
  }

  private formatReasons(reasons: string[]): string {
    if (reasons.length === 0) {
      return 'Sin razones registradas.';
    }

    return reasons.map((reason) => `✅ ${reason}`).join('\n');
  }
}
