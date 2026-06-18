import { dividends } from '../watchlists/dividends';
import { etfs } from '../watchlists/etfs';
import { growth } from '../watchlists/growth';

export type WatchlistName = 'etfs' | 'growth' | 'dividends' | 'custom';

export class WatchlistService {
  public constructor(
    private readonly selectedWatchlist: WatchlistName,
    private readonly customTickers: string[],
  ) {}

  public getTickers(): string[] {
    const watchlists: Record<Exclude<WatchlistName, 'custom'>, string[]> = {
      etfs,
      growth,
      dividends,
    };

    if (this.selectedWatchlist === 'custom') {
      return this.customTickers;
    }

    return watchlists[this.selectedWatchlist];
  }
}
