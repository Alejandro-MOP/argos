import { parseCapital } from '../src/utils/parse.utils';

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
