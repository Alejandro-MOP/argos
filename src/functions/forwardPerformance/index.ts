import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { forwardPerformanceReportProvider } from '../../config/container';
import type { ForwardPerformanceFilters } from '../../models/EvidenceSignal';

export async function forwardPerformance(
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
        message: 'Use GET /api/forward-performance',
      },
    };
  }

  if (!forwardPerformanceReportProvider) {
    return {
      status: 503,
      jsonBody: {
        ok: false,
        error: 'forward-performance-unavailable',
        message: 'DATABASE_URL is required to query forward/evidence performance.',
      },
    };
  }

  const filters = parseFilters(request);
  const result = await forwardPerformanceReportProvider.getPerformance(filters);

  return {
    status: 200,
    jsonBody: {
      ok: true,
      ...result,
    },
  };
}

app.http('forwardPerformance', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'forward-performance',
  handler: forwardPerformance,
});

const parseFilters = (request: HttpRequest): ForwardPerformanceFilters => ({
  ticker: optionalString(request.query.get('ticker'))?.toUpperCase(),
  timeframe: optionalString(request.query.get('timeframe'))?.toLowerCase(),
  minimumScore: optionalNumber(request.query.get('minimumScore')),
  maximumScore: optionalNumber(request.query.get('maximumScore')),
  scoreBucket: optionalString(request.query.get('scoreBucket')),
  assetType: optionalString(request.query.get('assetType'))?.toUpperCase(),
  sector: optionalString(request.query.get('sector')),
  industry: optionalString(request.query.get('industry')),
  strategyVersion: optionalString(request.query.get('strategyVersion')),
  from: optionalDate(request.query.get('from')),
  to: optionalDate(request.query.get('to')),
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

const optionalDate = (value: string | null): Date | undefined => {
  const normalized = optionalString(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
