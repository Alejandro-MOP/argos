import type { Candle } from '../models/Candle';
import type { EngineRuntimeConfig } from '../models/EngineConfig';
import type { AssetType, MarketScanCandidate } from '../models/MarketSymbol';
import type { Opportunity } from '../models/Opportunity';
import {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../errors/MarketDataErrors';
import type { MarketDataService } from './MarketDataService';
import type { MarketUniverseService } from './MarketUniverseService';
import type { EngineConfigService } from './EngineConfigService';
import type { OpportunityService } from './OpportunityService';

const MINIMUM_ANALYSIS_CANDLES = 60;
export const SUPPORTED_ANALYZE_SYMBOL_TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d', '1w'] as const;

export type AnalyzeSymbolTimeframe = (typeof SUPPORTED_ANALYZE_SYMBOL_TIMEFRAMES)[number];
export type AnalyzeSymbolErrorCode =
  | 'invalid-symbol'
  | 'unsupported-timeframe'
  | 'symbol-not-in-market-universe'
  | 'insufficient-candles'
  | 'rate-limit-exceeded'
  | 'market-data-unavailable'
  | 'analysis-failed';

export interface AnalyzeSymbolRequest {
  symbol: string;
  timeframe: string;
}

export interface AnalyzeSymbolResult {
  symbol: string;
  providerSymbol: string;
  timeframe: AnalyzeSymbolTimeframe;
  assetType?: AssetType;
  latestClose: number;
  latestCandleTimestamp: Date;
  candlesReturned: number;
  score: number;
  trendScore: number;
  volumeScore: number;
  momentumScore: number;
  structureScore: number;
  reasons: string[];
  operationalThreshold: number;
  aboveOperationalThreshold: boolean;
}

export interface AnalyzeSymbolServiceDependencies {
  marketDataService: Pick<MarketDataService, 'getCandles'>;
  engineConfigService: Pick<EngineConfigService, 'loadSnapshot'>;
  opportunityServiceFactory: (config: EngineRuntimeConfig) => Pick<OpportunityService, 'analyze'>;
  marketUniverseService: Pick<MarketUniverseService, 'loadSnapshot' | 'buildScanCandidates'>;
}

export class AnalyzeSymbolService {
  public constructor(private readonly dependencies: AnalyzeSymbolServiceDependencies) {}

  public async analyze(request: AnalyzeSymbolRequest): Promise<AnalyzeSymbolResult> {
    const symbol = normalizeAnalyzeSymbol(request.symbol);
    const timeframe = normalizeAnalyzeTimeframe(request.timeframe);
    const configSnapshot = await this.dependencies.engineConfigService.loadSnapshot();
    const config = configSnapshot.values;
    const opportunityService = this.dependencies.opportunityServiceFactory(config);
    const candidate = await this.resolveCandidate(symbol, timeframe);

    try {
      const candles = await this.dependencies.marketDataService.getCandles(
        candidate.providerSymbol,
        timeframe,
        config.marketScanCandleLimit,
      );

      if (candles.length < MINIMUM_ANALYSIS_CANDLES) {
        throw new AnalyzeSymbolServiceError(
          'insufficient-candles',
          `Not enough candles to analyze ${symbol} ${timeframe}.`,
        );
      }

      const latestCandle = candles.at(-1);

      if (!latestCandle) {
        throw new AnalyzeSymbolServiceError(
          'insufficient-candles',
          `Not enough candles to analyze ${symbol} ${timeframe}.`,
        );
      }

      const opportunity = opportunityService.analyze(
        candidate.symbol,
        timeframe,
        candles,
      );

      return toAnalyzeSymbolResult({
        opportunity,
        latestCandle,
        candlesReturned: candles.length,
        candidate,
        operationalThreshold: config.scoring.opportunityMinScore,
      });
    } catch (error) {
      if (error instanceof AnalyzeSymbolServiceError) {
        throw error;
      }

      throw mapAnalyzeSymbolError(error, symbol, timeframe);
    }
  }

  private async resolveCandidate(symbol: string, timeframe: AnalyzeSymbolTimeframe): Promise<MarketScanCandidate> {
    try {
      const snapshot = await this.dependencies.marketUniverseService.loadSnapshot();
      const [candidate] = this.dependencies.marketUniverseService.buildScanCandidates(snapshot, {
        tickers: [symbol],
        timeframes: [timeframe],
      });

      if (!candidate) {
        throw new AnalyzeSymbolServiceError(
          'symbol-not-in-market-universe',
          `Symbol ${symbol} is not active in market universe.`,
        );
      }

      return candidate;
    } catch (error) {
      if (error instanceof AnalyzeSymbolServiceError) {
        throw error;
      }

      if (error instanceof Error && error.message.startsWith('symbol-not-in-market-universe')) {
        throw new AnalyzeSymbolServiceError(
          'symbol-not-in-market-universe',
          `Symbol ${symbol} is not active in market universe.`,
        );
      }

      throw error;
    }
  }
}

export class AnalyzeSymbolServiceError extends Error {
  public constructor(
    public readonly code: AnalyzeSymbolErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AnalyzeSymbolServiceError';
  }
}

export const normalizeAnalyzeSymbol = (symbol: string): string => {
  const normalized = symbol.trim().toUpperCase();

  if (!normalized || normalized.length > 32 || !/^[A-Z0-9.^=_-]+$/.test(normalized)) {
    throw new AnalyzeSymbolServiceError('invalid-symbol', 'Symbol must be a non-empty Yahoo-compatible ticker.');
  }

  return normalized;
};

export const normalizeAnalyzeTimeframe = (timeframe: string): AnalyzeSymbolTimeframe => {
  const normalized = timeframe.trim().toLowerCase();

  if (SUPPORTED_ANALYZE_SYMBOL_TIMEFRAMES.includes(normalized as AnalyzeSymbolTimeframe)) {
    return normalized as AnalyzeSymbolTimeframe;
  }

  throw new AnalyzeSymbolServiceError(
    'unsupported-timeframe',
    `Unsupported analyze timeframe: ${timeframe}.`,
  );
};

const toAnalyzeSymbolResult = (params: {
  opportunity: Opportunity;
  latestCandle: Candle;
  candlesReturned: number;
  candidate: MarketScanCandidate;
  operationalThreshold: number;
}): AnalyzeSymbolResult => ({
  symbol: params.candidate.symbol,
  providerSymbol: params.candidate.providerSymbol,
  timeframe: normalizeAnalyzeTimeframe(params.opportunity.timeframe),
  assetType: params.candidate.metadata.assetType,
  latestClose: params.latestCandle.close,
  latestCandleTimestamp: params.latestCandle.timestamp,
  candlesReturned: params.candlesReturned,
  score: params.opportunity.score,
  trendScore: params.opportunity.trendScore,
  volumeScore: params.opportunity.volumeScore,
  momentumScore: params.opportunity.momentumScore,
  structureScore: params.opportunity.structureScore,
  reasons: params.opportunity.reasons,
  operationalThreshold: params.operationalThreshold,
  aboveOperationalThreshold: params.opportunity.score >= params.operationalThreshold,
});

const mapAnalyzeSymbolError = (error: unknown, symbol: string, timeframe: AnalyzeSymbolTimeframe): AnalyzeSymbolServiceError => {
  if (error instanceof InsufficientCandlesError) {
    return new AnalyzeSymbolServiceError(
      'insufficient-candles',
      `Not enough candles to analyze ${symbol} ${timeframe}.`,
    );
  }

  if (error instanceof MarketDataRateLimitError) {
    return new AnalyzeSymbolServiceError(
      'rate-limit-exceeded',
      `Market data provider rate limit reached for ${symbol} ${timeframe}.`,
      error.status,
    );
  }

  if (error instanceof MarketDataProviderError) {
    return new AnalyzeSymbolServiceError(
      'market-data-unavailable',
      `Market data provider unavailable for ${symbol} ${timeframe}.`,
      error.details.status,
    );
  }

  return new AnalyzeSymbolServiceError(
    'analysis-failed',
    error instanceof Error ? error.message : `Unable to analyze ${symbol} ${timeframe}.`,
  );
};
