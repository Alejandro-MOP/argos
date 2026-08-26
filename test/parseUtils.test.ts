import { parseCapital, parseScoreThreshold, parseTimeframes } from '../src/utils/parse.utils';

describe('parseCapital', () => {
  it('parses positive numeric capital values', () => {
    expect(parseCapital(1_000)).toBe(1_000);
    expect(parseCapital('2500.50')).toBe(2500.5);
  });

  it('ignores empty, invalid or non-positive capital values', () => {
    expect(parseCapital(undefined)).toBeUndefined();
    expect(parseCapital('')).toBeUndefined();
    expect(parseCapital('abc')).toBeUndefined();
    expect(parseCapital(0)).toBeUndefined();
    expect(parseCapital('-10')).toBeUndefined();
  });
});


describe('parseScoreThreshold', () => {
  it('parses numeric threshold overrides including zero', () => {
    expect(parseScoreThreshold(90)).toBe(90);
    expect(parseScoreThreshold('85')).toBe(85);
    expect(parseScoreThreshold('90.5')).toBe(90.5);
    expect(parseScoreThreshold(0)).toBe(0);
  });

  it('ignores empty, invalid or negative threshold values', () => {
    expect(parseScoreThreshold(undefined)).toBeUndefined();
    expect(parseScoreThreshold('')).toBeUndefined();
    expect(parseScoreThreshold('abc')).toBeUndefined();
    expect(parseScoreThreshold('-1')).toBeUndefined();
  });
});


describe('parseTimeframes', () => {
  it('parses and deduplicates supported timeframes', () => {
    expect(parseTimeframes('1m,5m,15m,1m')).toEqual(['1m', '5m', '15m']);
    expect(parseTimeframes(['1D', '1w', '1d'])).toEqual(['1d', '1w']);
  });

  it('returns undefined for empty values', () => {
    expect(parseTimeframes(undefined)).toBeUndefined();
    expect(parseTimeframes('')).toBeUndefined();
  });

  it('rejects unsupported timeframes', () => {
    expect(() => parseTimeframes('1m,4h')).toThrow('Unsupported market scan timeframe');
  });
});
