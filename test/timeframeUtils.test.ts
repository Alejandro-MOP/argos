import { getOpportunityTypeFromTimeframe } from '../src/utils/timeframe.utils';

describe('getOpportunityTypeFromTimeframe', () => {
  it('classifies minute timeframes for scalping and intraday opportunities', () => {
    expect(getOpportunityTypeFromTimeframe('1m')).toBe('scalping');
    expect(getOpportunityTypeFromTimeframe('5m')).toBe('scalping');
    expect(getOpportunityTypeFromTimeframe('15m')).toBe('intradia');
    expect(getOpportunityTypeFromTimeframe('30m')).toBe('intradia');
  });

  it('classifies hourly and higher timeframes for swing or position opportunities', () => {
    expect(getOpportunityTypeFromTimeframe('1h')).toBe('swing-corto');
    expect(getOpportunityTypeFromTimeframe('4h')).toBe('swing-corto');
    expect(getOpportunityTypeFromTimeframe('1d')).toBe('swing');
    expect(getOpportunityTypeFromTimeframe('1w')).toBe('posicion');
  });

  it('normalizes casing and surrounding spaces', () => {
    expect(getOpportunityTypeFromTimeframe(' 15M ')).toBe('intradia');
    expect(getOpportunityTypeFromTimeframe(' 1W ')).toBe('posicion');
  });
});
