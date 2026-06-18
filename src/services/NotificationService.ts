import type { Signal } from '../models/Signal';
import type { Opportunity } from '../models/Opportunity';
import type { TelegramClient } from '../clients/TelegramClient';

export class NotificationService {
  public constructor(private readonly telegramClient?: TelegramClient) {}

  public async sendSignal(signal: Signal, opportunity?: Opportunity): Promise<void> {
    const message = opportunity
      ? this.formatOpportunitySignal(signal, opportunity)
      : [
          `Señal ${signal.signalType}: ${signal.ticker}`,
          `Temporalidad: ${signal.timeframe}`,
          `Entrada: ${signal.entry}`,
          `Stop: ${signal.stop}`,
          `Objetivo: ${signal.target}`,
          `Score: ${signal.score}`,
        ].join(' | ');

    await this.sendMessage(message);
  }

  public async sendMessage(message: string): Promise<void> {
    if (this.telegramClient && (await this.telegramClient.sendMessage(message))) {
      return;
    }

    console.log(message);
  }

  private formatOpportunitySignal(signal: Signal, opportunity: Opportunity): string {
    const reasons = opportunity.reasons.map((reason) => `* ${reason}`).join('\n');

    return [
      '🚨 OPORTUNIDAD DETECTADA',
      '',
      'Ticker:',
      opportunity.ticker,
      '',
      'Timeframe:',
      signal.timeframe,
      '',
      'Score:',
      `${opportunity.score}/100`,
      '',
      'Trend:',
      `${opportunity.trendScore}`,
      '',
      'Volume:',
      `${opportunity.volumeScore}`,
      '',
      'Momentum:',
      `${opportunity.momentumScore}`,
      '',
      'Structure:',
      `${opportunity.structureScore}`,
      '',
      'Razones:',
      '',
      reasons,
      '',
      'Entry:',
      `${signal.entry}`,
      '',
      'Stop:',
      `${signal.stop}`,
      '',
      'Target:',
      `${signal.target}`,
      '',
      'Risk/Reward:',
      this.formatRiskReward(signal),
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
}
