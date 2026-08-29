import type {
  BrokerProductProfile,
  BrokerProductProfileId,
  CurrencyCode,
  FeeRule,
} from '../models/TransactionCost';

const BITSO_FEES_SOURCE_URL = 'https://bitso.com/fees';
const BITSO_VERIFIED_AT = new Date('2026-08-28T00:00:00.000Z');
const BITSO_EFFECTIVE_FROM = new Date('2026-08-28T00:00:00.000Z');

function percentageFee(percent: number): FeeRule {
  return {
    type: 'PERCENTAGE_NOTIONAL',
    percent,
  };
}

function createBitsoCryptoProfile(params: {
  id: BrokerProductProfileId;
  quoteCurrency: CurrencyCode;
  currencyDecimals: number;
  makerPercent: number;
  takerPercent: number;
  version: string;
  sourceLabel: string;
  notes: string;
}): BrokerProductProfile {
  const makerFee = percentageFee(params.makerPercent);
  const takerFee = percentageFee(params.takerPercent);

  return {
    id: params.id,
    broker: 'BITSO',
    product: `Crypto spot vs ${params.quoteCurrency}`,
    assetType: 'CRYPTO',
    quoteCurrency: params.quoteCurrency,
    currencyDecimals: params.currencyDecimals,
    feeSchedule: {
      broker: 'BITSO',
      productProfileId: params.id,
      version: params.version,
      effectiveFrom: BITSO_EFFECTIVE_FROM,
      sourceLabel: params.sourceLabel,
      sourceUrl: BITSO_FEES_SOURCE_URL,
      verifiedAt: BITSO_VERIFIED_AT,
      notes: params.notes,
      tradeCosts: {
        makerBuy: makerFee,
        takerBuy: takerFee,
        makerSell: makerFee,
        takerSell: takerFee,
      },
    },
  };
}

export const BROKER_PRODUCT_PROFILES: BrokerProductProfile[] = [
  createBitsoCryptoProfile({
    id: 'BITSO_CRYPTO_MXN',
    quoteCurrency: 'MXN',
    currencyDecimals: 2,
    makerPercent: 0.6,
    takerPercent: 0.78,
    version: 'bitso-crypto-mxn-base-tier-2026-08-28',
    sourceLabel: 'Bitso fees, markets vs Mexican Pesos (MXN), base volume tier < 20,000 MXN',
    notes:
      'Base maker/taker tier captured from Bitso public fees. Fee schedules must be re-verified before production trading decisions.',
  }),
  createBitsoCryptoProfile({
    id: 'BITSO_CRYPTO_USDC',
    quoteCurrency: 'USDC',
    currencyDecimals: 6,
    makerPercent: 0.3,
    takerPercent: 0.36,
    version: 'bitso-crypto-usdc-base-tier-2026-08-28',
    sourceLabel: 'Bitso fees, markets vs USDC (Digital Dollars), base volume tier < 1,000 USD',
    notes:
      'Base maker/taker tier captured from Bitso public fees. Fee schedules must be re-verified before production trading decisions.',
  }),
];

export function findBrokerProductProfile(
  profileId: BrokerProductProfileId,
  asOf: Date = new Date(),
): BrokerProductProfile | undefined {
  const profile = BROKER_PRODUCT_PROFILES.find((candidate) => candidate.id === profileId);

  if (!profile) {
    return undefined;
  }

  const { effectiveFrom, effectiveTo } = profile.feeSchedule;

  if (asOf < effectiveFrom) {
    return undefined;
  }

  if (effectiveTo && asOf > effectiveTo) {
    return undefined;
  }

  return profile;
}
