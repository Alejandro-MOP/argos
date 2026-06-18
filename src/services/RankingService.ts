import type { Opportunity } from '../models/Opportunity';

export class RankingService {
  public rank(opportunities: Opportunity[]): Opportunity[] {
    return [...opportunities].sort((left, right) => right.score - left.score);
  }
}
