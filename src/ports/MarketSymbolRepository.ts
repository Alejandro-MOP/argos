import type { MarketSymbol } from '../models/MarketSymbol';

export interface MarketSymbolRepository {
  findActiveWithTimeframes(): Promise<MarketSymbol[]>;
}
