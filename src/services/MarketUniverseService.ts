import type { AssetType, MarketScanCandidate, MarketSymbol, MarketUniverseSnapshot } from '../models/MarketSymbol';
import type { MarketSymbolRepository } from '../ports/MarketSymbolRepository';

export interface MarketUniverseLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface BuildScanCandidatesOptions {
  tickers?: string[];
  timeframe?: string;
  timeframes?: string[];
  fallbackTimeframes?: string[];
}

export class MarketUniverseSymbolNotFoundError extends Error {
  public constructor(symbol: string) {
    super(`symbol-not-in-market-universe: ${symbol}`);
    this.name = 'MarketUniverseSymbolNotFoundError';
  }
}

export class MarketUniverseService {
  public constructor(private readonly repository: MarketSymbolRepository) {}

  public async loadSnapshot(logger?: MarketUniverseLogger): Promise<MarketUniverseSnapshot> {
    const symbols = await this.repository.findActiveWithTimeframes();

    if (symbols.length === 0) {
      throw new Error('market-universe-unavailable: no active market_symbols rows found');
    }

    logger?.log('universeSource=postgres');
    return { source: 'postgres', symbols };
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
        logger?.error(`symbol-not-in-market-universe symbol=${ticker}`);
        throw new MarketUniverseSymbolNotFoundError(ticker);
      }

      const timeframes = explicitTimeframes ?? metadata.timeframes;

      if (timeframes.length === 0) {
        throw new Error(`market-universe-incomplete: ${ticker} has no active timeframes`);
      }

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

  public listAssetTypes(snapshot: MarketUniverseSnapshot): AssetType[] {
    return [...new Set(snapshot.symbols.map((symbol) => symbol.assetType))].sort();
  }

  public listSectors(snapshot: MarketUniverseSnapshot, assetType: AssetType): string[] {
    return this.uniqueSorted(
      snapshot.symbols
        .filter((symbol) => symbol.assetType === assetType)
        .map((symbol) => normalizeNavigationGroup(symbol.sector)),
    );
  }

  public listIndustries(snapshot: MarketUniverseSnapshot, assetType: AssetType, sector: string): string[] {
    return this.uniqueSorted(
      snapshot.symbols
        .filter((symbol) => symbol.assetType === assetType)
        .filter((symbol) => normalizeNavigationGroup(symbol.sector) === sector)
        .map((symbol) => normalizeNavigationGroup(symbol.industry)),
    );
  }

  public listSymbols(
    snapshot: MarketUniverseSnapshot,
    filters: { assetType: AssetType; sector?: string; industry?: string },
  ): MarketSymbol[] {
    return snapshot.symbols
      .filter((symbol) => symbol.assetType === filters.assetType)
      .filter((symbol) => filters.sector === undefined || normalizeNavigationGroup(symbol.sector) === filters.sector)
      .filter((symbol) => filters.industry === undefined || normalizeNavigationGroup(symbol.industry) === filters.industry)
      .sort((left, right) => left.symbol.localeCompare(right.symbol));
  }

  private uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
}

const normalizeNavigationGroup = (value: string | undefined): string => {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : 'Other / Unclassified';
};
