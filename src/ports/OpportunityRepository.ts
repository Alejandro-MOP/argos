import type { Opportunity } from '../models/Opportunity';

export interface OpportunityRepository {
  save(opportunity: Opportunity): Promise<void>;
  findAll(): Promise<Opportunity[]>;
  findRecentByTicker(ticker: string, timeframe: string, since: Date): Promise<Opportunity[]>;
}
