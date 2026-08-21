export type OpportunityType = 'scalping' | 'intradia' | 'swing-corto' | 'swing' | 'posicion';

export const getOpportunityTypeFromTimeframe = (timeframe: string): OpportunityType => {
  const normalizedTimeframe = timeframe.trim().toLowerCase();

  if (normalizedTimeframe === '1m' || normalizedTimeframe === '5m') {
    return 'scalping';
  }

  if (normalizedTimeframe === '15m' || normalizedTimeframe === '30m') {
    return 'intradia';
  }

  if (normalizedTimeframe === '1h' || normalizedTimeframe === '4h') {
    return 'swing-corto';
  }

  if (normalizedTimeframe === '1w') {
    return 'posicion';
  }

  return 'swing';
};
