import type { Signal } from '../models/Signal';
import type { Opportunity } from '../models/Opportunity';
import type { TelegramClient } from '../clients/TelegramClient';

export class NotificationService {
  public constructor(private readonly telegramClient?: TelegramClient) {}

  public async sendSignal(signal: Signal, opportunity?: Opportunity): Promise<void> {
    const message = opportunity
      ? this.formatOpportunitySignal(signal, opportunity)
      : [
          `Signal ${signal.signalType}: ${signal.ticker}`,
          `Timeframe: ${signal.timeframe}`,
          `Entry: ${signal.entry}`,
          `Stop: ${signal.stop}`,
          `Target: ${signal.target}`,
          `Score: ${signal.score}`,
        ].join(' | ');

    if (this.telegramClient) {
      await this.telegramClient.sendMessage(message);
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
    ].join('\n');
  }
}
