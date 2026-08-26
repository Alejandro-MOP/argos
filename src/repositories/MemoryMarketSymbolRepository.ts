import type { MarketSymbol } from '../models/MarketSymbol';
import type { MarketSymbolRepository } from '../ports/MarketSymbolRepository';

export class MemoryMarketSymbolRepository implements MarketSymbolRepository {
  public async findActiveWithTimeframes(): Promise<MarketSymbol[]> {
    return [];
  }
}
