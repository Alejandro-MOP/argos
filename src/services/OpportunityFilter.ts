import type { Opportunity } from '../models/Opportunity';
import type { OpportunityRepository } from '../ports/OpportunityRepository';

export interface OpportunityFilterConfig {
  minimumScore: number;
  duplicateWindowMinutes: number;
}

export type OpportunityFilterSkipReason = 'below-threshold' | 'duplicate-window';

export interface OpportunityFilterResult {
  shouldNotify: boolean;
  reason?: OpportunityFilterSkipReason;
}

export class OpportunityFilter {
  public constructor(
    private readonly opportunityRepository: OpportunityRepository,
    private readonly config: OpportunityFilterConfig,
  ) {}

  public async shouldNotify(opportunity: Opportunity): Promise<boolean> {
    const result = await this.evaluate(opportunity);

    return result.shouldNotify;
  }

  public getMinimumScore(): number {
    return this.config.minimumScore;
  }

  public async evaluate(opportunity: Opportunity): Promise<OpportunityFilterResult> {
    if (opportunity.score < this.config.minimumScore) {
      return {
        shouldNotify: false,
        reason: 'below-threshold',
      };
    }

    const duplicateWindowStart = new Date(
      opportunity.detectedAt.getTime() - this.config.duplicateWindowMinutes * 60 * 1000,
    );
    const recentOpportunities = await this.opportunityRepository.findRecentByTicker(
      opportunity.ticker,
      opportunity.timeframe,
      duplicateWindowStart,
    );

    if (recentOpportunities.length > 0) {
      return {
        shouldNotify: false,
        reason: 'duplicate-window',
      };
    }

    return {
      shouldNotify: true,
    };
  }
}
