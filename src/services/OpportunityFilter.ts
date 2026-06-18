import type { Opportunity } from '../models/Opportunity';
import type { OpportunityRepository } from '../ports/OpportunityRepository';

export interface OpportunityFilterConfig {
  minimumScore: number;
  duplicateWindowMinutes: number;
}

export class OpportunityFilter {
  public constructor(
    private readonly opportunityRepository: OpportunityRepository,
    private readonly config: OpportunityFilterConfig,
  ) {}

  public async shouldNotify(opportunity: Opportunity): Promise<boolean> {
    if (opportunity.score < this.config.minimumScore) {
      return false;
    }

    const duplicateWindowStart = new Date(
      opportunity.detectedAt.getTime() - this.config.duplicateWindowMinutes * 60 * 1000,
    );
    const recentOpportunities = await this.opportunityRepository.findRecentByTicker(
      opportunity.ticker,
      opportunity.timeframe,
      duplicateWindowStart,
    );

    return recentOpportunities.length === 0;
  }
}
