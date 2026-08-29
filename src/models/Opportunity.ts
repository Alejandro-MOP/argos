export interface Opportunity {
  ticker: string;
  timeframe: string;
  score: number;
  trendScore: number;
  volumeScore: number;
  momentumScore: number;
  structureScore: number;
  reasons: string[];
  detectedAt: Date;
  signalCandleTimestamp?: Date;
  strategyVersion?: string;
}
