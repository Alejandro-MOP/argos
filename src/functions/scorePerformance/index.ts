import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { scorePerformanceResearchService } from '../../config/container';
import type {
  ScorePerformanceAssetType,
  ScorePerformanceResearchFilters,
} from '../../models/ScorePerformanceResearch';

export async function scorePerformance(
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
        message: 'Use GET /api/score-performance',
      },
    };
  }

  if (!scorePerformanceResearchService) {
    return {
      status: 503,
      jsonBody: {
        ok: false,
        error: 'score-performance-unavailable',
        message: 'DATABASE_URL is required to query score performance research.',
      },
    };
  }

  const filters = parseFilters(request);
  const result = await scorePerformanceResearchService.analyze(filters);

  return {
    status: 200,
    jsonBody: {
      ok: true,
      ...result,
    },
  };
}

app.http('scorePerformance', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'score-performance',
  handler: scorePerformance,
});

const parseFilters = (request: HttpRequest): ScorePerformanceResearchFilters => ({
  strategyVersion: optionalString(request.query.get('strategyVersion')) ?? 'v1',
  timeframe: optionalString(request.query.get('timeframe'))?.toLowerCase() ?? '15m',
  assetType: optionalAssetType(request.query.get('assetType')),
  scoreMin: optionalNumber(request.query.get('scoreMin')),
  scoreMax: optionalNumber(request.query.get('scoreMax')),
  exactScore: optionalNumber(request.query.get('exactScore')),
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

const optionalAssetType = (value: string | null): ScorePerformanceAssetType | undefined => {
  const normalized = optionalString(value)?.toUpperCase();
  if (normalized === 'STOCK' || normalized === 'ETF' || normalized === 'CRYPTO') {
    return normalized;
  }

  return undefined;
};
