import type { AssetType, MarketScanCandidate, MarketSymbol, MarketUniverseSnapshot } from '../models/MarketSymbol';
import type { MarketSymbolRepository } from '../ports/MarketSymbolRepository';
import type { WatchlistService } from './WatchlistService';

export interface MarketUniverseLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface BuildScanCandidatesOptions {
  tickers?: string[];
  timeframe?: string;
  timeframes?: string[];
  fallbackTimeframes: string[];
}

export class MarketUniverseService {
  public constructor(
    private readonly repository: MarketSymbolRepository,
    private readonly watchlistService: WatchlistService,
  ) {}

  public async loadSnapshot(logger?: MarketUniverseLogger): Promise<MarketUniverseSnapshot> {
    try {
      const symbols = await this.repository.findActiveWithTimeframes();

      if (symbols.length === 0) {
        logger?.log('universeSource=env-fallback reason=no-active-market-symbols');
        return this.loadFallbackSnapshot();
      }

      logger?.log('universeSource=postgres');
      return { source: 'postgres', symbols };
    } catch (error) {
      logger?.error('universeSource=env-fallback reason=market-universe-load-failed', {
        message: error instanceof Error ? error.message : 'unknown-error',
      });
      return this.loadFallbackSnapshot();
    }
  }

  public buildScanCandidates(
    snapshot: MarketUniverseSnapshot,
    options: BuildScanCandidatesOptions,
    logger?: MarketUniverseLogger,
  ): MarketScanCandidate[] {
    const symbolsByTicker = new Map(snapshot.symbols.map((symbol) => [symbol.symbol, symbol]));
    const requestedTickers = options.tickers?.length
      ? options.tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)
      : snapshot.symbols.map((symbol) => symbol.symbol);
    const explicitTimeframes = this.resolveExplicitTimeframes(options);
    const candidates: MarketScanCandidate[] = [];

    for (const ticker of requestedTickers) {
      const metadata = symbolsByTicker.get(ticker);

      if (!metadata) {
        logger?.log(`symbol-not-in-market-universe symbol=${ticker}`);
        const fallbackMetadata = this.buildFallbackSymbol(ticker);
        const timeframes = explicitTimeframes ?? options.fallbackTimeframes;
        candidates.push(
          ...timeframes.map((timeframe) => ({
            symbol: fallbackMetadata.symbol,
            providerSymbol: fallbackMetadata.providerSymbol,
            timeframe,
            metadata: fallbackMetadata,
            source: 'manual-fallback' as const,
          })),
        );
        continue;
      }

      const timeframes = explicitTimeframes ?? (metadata.timeframes.length > 0 ? metadata.timeframes : options.fallbackTimeframes);
      candidates.push(
        ...timeframes.map((timeframe) => ({
          symbol: metadata.symbol,
          providerSymbol: metadata.providerSymbol,
          timeframe,
          metadata,
          source: snapshot.source,
        })),
      );
    }

    return candidates;
  }

  private resolveExplicitTimeframes(options: BuildScanCandidatesOptions): string[] | undefined {
    const timeframes = options.timeframes && options.timeframes.length > 0
      ? options.timeframes
      : options.timeframe
        ? [options.timeframe]
        : undefined;

    if (!timeframes) {
      return undefined;
    }

    return [...new Set(timeframes.map((timeframe) => timeframe.trim().toLowerCase()).filter(Boolean))];
  }

  private loadFallbackSnapshot(): MarketUniverseSnapshot {
    const symbols = this.watchlistService.getTickers().map((ticker) => this.buildFallbackSymbol(ticker));

    return { source: 'env-fallback', symbols };
  }

  private buildFallbackSymbol(ticker: string): MarketSymbol {
    const symbol = ticker.trim().toUpperCase();
    const isCrypto = symbol.endsWith('-USD');

    return {
      symbol,
      providerSymbol: symbol,
      displayName: symbol,
      assetType: isCrypto ? 'CRYPTO' : this.getFallbackAssetType(symbol),
      sector: isCrypto ? 'Crypto' : undefined,
      industry: undefined,
      exchange: undefined,
      market: isCrypto ? 'Crypto' : 'US',
      timezone: isCrypto ? 'UTC' : 'America/New_York',
      sessionType: isCrypto ? 'TWENTY_FOUR_SEVEN' : 'US_REGULAR',
      supportsIntraday: true,
      description: 'Metadata mínima construida por fallback; no fue insertada automáticamente en PostgreSQL.',
      isActive: true,
      timeframes: [],
    };
  }

  private getFallbackAssetType(symbol: string): AssetType {
    return ['SPY', 'QQQ', 'VOO', 'XLP', 'XLV', 'VGT', 'GLD'].includes(symbol) ? 'ETF' : 'STOCK';
  }
}
