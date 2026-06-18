import type { Opportunity } from '../models/Opportunity';
import type { OpportunityRepository } from '../ports/OpportunityRepository';

export class OpportunityMemoryRepository implements OpportunityRepository {
  private readonly opportunities: Opportunity[] = [];

  public async save(opportunity: Opportunity): Promise<void> {
    this.opportunities.push(opportunity);
  }

  public async findAll(): Promise<Opportunity[]> {
    return [...this.opportunities];
  }

  public async findRecentByTicker(
    ticker: string,
    timeframe: string,
    since: Date,
  ): Promise<Opportunity[]> {
    return this.opportunities.filter(
      (opportunity) =>
        opportunity.ticker === ticker &&
        opportunity.timeframe === timeframe &&
        opportunity.detectedAt >= since,
    );
  }
}
