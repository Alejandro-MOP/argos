import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { strategyProfileProvider } from '../../config/container';
import type {
  StrategyProfileFilters,
  StrategyProfileScoreBucket,
} from '../../models/StrategyProfile';

export async function strategyProfiles(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  void context;

  if (request.method !== 'GET') {
    return {
      status: 405,
      jsonBody: {
        ok: false,
        error: 'method-not-allowed',
        message: 'Use GET /api/strategy-profiles',
      },
    };
  }

  if (!strategyProfileProvider) {
    return {
      status: 503,
      jsonBody: {
        ok: false,
        error: 'strategy-profiles-unavailable',
        message: 'DATABASE_URL is required to query strategy profiles.',
      },
    };
  }

  const filters = parseFilters(request);
  const result = await strategyProfileProvider.getProfiles(filters);

  return {
    status: 200,
    jsonBody: {
      ok: true,
      ...result,
    },
  };
}

app.http('strategyProfiles', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'strategy-profiles',
  handler: strategyProfiles,
});

const parseFilters = (request: HttpRequest): StrategyProfileFilters => ({
  assetType: optionalString(request.query.get('assetType'))?.toUpperCase(),
  timeframe: optionalString(request.query.get('timeframe'))?.toLowerCase(),
  scoreBucket: optionalScoreBucket(request.query.get('scoreBucket')),
  strategyVersion: optionalString(request.query.get('strategyVersion')),
  minimumSampleSize: optionalNumber(request.query.get('minimumSampleSize')),
});

const optionalString = (value: string | null): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const optionalNumber = (value: string | null): number | undefined => {
  const normalized = optionalString(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const optionalScoreBucket = (value: string | null): StrategyProfileScoreBucket | undefined => {
  const normalized = optionalString(value);
  if (
    normalized === '80-84' ||
    normalized === '85-89' ||
    normalized === '90-94' ||
    normalized === '95-100'
  ) {
    return normalized;
  }

  return undefined;
};
