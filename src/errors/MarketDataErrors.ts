import type { SanitizedProviderError } from '../utils/sanitizeError';

export class InsufficientCandlesError extends Error {
  public constructor(
    public readonly ticker: string,
    public readonly candlesCount: number,
    public readonly requestedFrom: string,
    public readonly requestedTo: string,
  ) {
    super('insufficient-candles');
  }
}

export class MarketDataRateLimitError extends Error {
  public constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly endpoint?: string,
    public readonly requestId?: string,
    public readonly statusText?: string,
  ) {
    super('rate-limit-exceeded');
  }
}

export class MarketDataProviderError extends Error {
  public constructor(public readonly details: SanitizedProviderError) {
    super(details.message);
  }
}
