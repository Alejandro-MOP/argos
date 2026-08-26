import type { MarketSymbol } from '../models/MarketSymbol';

export type MarketSessionSkipReason = 'market-closed';

export interface MarketSessionDecision {
  canScan: boolean;
  reason?: MarketSessionSkipReason;
}

export class MarketSessionService {
  public canScan(symbol: MarketSymbol, timeframe: string, now = new Date()): MarketSessionDecision {
    if (symbol.sessionType === 'TWENTY_FOUR_SEVEN') {
      return { canScan: true };
    }

    if (symbol.sessionType === 'US_REGULAR' && this.isIntradayTimeframe(timeframe)) {
      return this.isUsRegularMarketOpen(symbol.timezone, now)
        ? { canScan: true }
        : { canScan: false, reason: 'market-closed' };
    }

    return { canScan: true };
  }

  public isIntradayTimeframe(timeframe: string): boolean {
    return ['1m', '5m', '15m', '30m', '1h'].includes(timeframe.trim().toLowerCase());
  }

  private isUsRegularMarketOpen(timezone: string, now: Date): boolean {
    const parts = this.getZonedParts(now, timezone || 'America/New_York');

    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
      return false;
    }

    const minutes = parts.hour * 60 + parts.minute;
    const open = 9 * 60 + 30;
    const close = 16 * 60;

    return minutes >= open && minutes < close;
  }

  private getZonedParts(date: Date, timeZone: string): { weekday: string; hour: number; minute: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string): string => parts.find((part) => part.type === type)?.value ?? '0';

    return {
      weekday: getPart('weekday'),
      hour: Number(getPart('hour')),
      minute: Number(getPart('minute')),
    };
  }
}
