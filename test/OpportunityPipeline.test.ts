import { MomentumAnalyzer } from '../src/analyzers/MomentumAnalyzer';
import { StructureAnalyzer } from '../src/analyzers/StructureAnalyzer';
import { TrendAnalyzer } from '../src/analyzers/TrendAnalyzer';
import { VolumeAnalyzer } from '../src/analyzers/VolumeAnalyzer';
import type { Candle } from '../src/models/Candle';
import type { Opportunity } from '../src/models/Opportunity';
import { OpportunityMemoryRepository } from '../src/repositories/OpportunityMemoryRepository';
import { OpportunityFilter } from '../src/services/OpportunityFilter';
import { OpportunityService } from '../src/services/OpportunityService';
import { RankingService } from '../src/services/RankingService';

const buildCandles = (): Candle[] => {
  const firstTimestamp = new Date('2026-08-24T12:00:00.000Z');

  return Array.from({ length: 80 }, (_, index) => {
    const isLast = index === 79;
    const drift = index * 0.18;
    const relativeIndex = 80 - index;
    const lateConsolidation = relativeIndex <= 15 ? (index % 2 === 0 ? 0.85 : -0.85) : 0;
    const close = isLast ? 118 + drift + 4 : 118 + drift + lateConsolidation;

    return {
      timestamp: new Date(firstTimestamp.getTime() + index * 60_000),
      open: close - 0.45,
      high: close + (isLast ? 0.2 : 0.8),
      low: close - 1.1,
      close,
      volume: isLast ? 2_500_000 : 1_000_000,
    };
  });
};

const buildOpportunity = (score: number): Opportunity => ({
  ticker: 'NVDA',
  timeframe: '15m',
  score,
  trendScore: 25,
  volumeScore: 25,
  momentumScore: 10,
  structureScore: 25,
  reasons: ['Breakout confirmado'],
  detectedAt: new Date(),
});

describe('Opportunity pipeline', () => {
  it('generates an opportunity with quantitative component scores', () => {
    const service = new OpportunityService({
      trendAnalyzer: new TrendAnalyzer({ fastPeriod: 20, slowPeriod: 50 }),
      volumeAnalyzer: new VolumeAnalyzer({
        lookbackPeriod: 20,
        strongRatio: 1.5,
        moderateRatio: 1.3,
        weakRatio: 1.1,
      }),
      momentumAnalyzer: new MomentumAnalyzer({
        rsiPeriod: 14,
        idealMin: 55,
        idealMax: 70,
        neutralMin: 45,
        neutralMax: 55,
        extendedMax: 80,
      }),
      structureAnalyzer: new StructureAnalyzer({ lookbackPeriod: 20 }),
    });

    const opportunity = service.analyze('NVDA', '15m', buildCandles());

    expect(opportunity.score).toBeGreaterThanOrEqual(80);
    expect(opportunity.reasons).toContain('Breakout confirmado');
    expect(opportunity.signalCandleTimestamp).toEqual(new Date('2026-08-24T13:19:00.000Z'));
  });

  it('ranks opportunities by score descending', () => {
    const rankingService = new RankingService();
    const ranked = rankingService.rank([buildOpportunity(80), buildOpportunity(95)]);

    expect(ranked[0].score).toBe(95);
  });

  it('filters low score and duplicate opportunities', async () => {
    const repository = new OpportunityMemoryRepository();
    const filter = new OpportunityFilter(repository, {
      minimumScore: 50,
      duplicateWindowMinutes: 60,
    });
    const opportunity = buildOpportunity(85);

    expect(filter.getMinimumScore()).toBe(50);
    expect(await filter.shouldNotify(buildOpportunity(49))).toBe(false);
    expect(await filter.shouldNotify(buildOpportunity(60))).toBe(true);
    expect(await filter.shouldNotify(opportunity)).toBe(true);

    await repository.save(opportunity);

    expect(await filter.shouldNotify(buildOpportunity(90))).toBe(false);
  });
});
