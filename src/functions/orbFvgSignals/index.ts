import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { ORB_FVG_EXPERIMENT_VERSION, type OrbFvgDirection, type OrbFvgStatus } from '../../models/OrbFvgSignal';
import { orbFvgSignalRepository } from '../../config/container';

export async function orbFvgSignals(request: HttpRequest): Promise<HttpResponseInit> {
  const result = await orbFvgSignalRepository.find({
    sessionDate: optionalString(request.query.get('sessionDate') ?? request.query.get('date')),
    ticker: optionalString(request.query.get('ticker')),
    assetType: parseAssetType(request.query.get('assetType')),
    direction: parseDirection(request.query.get('direction')),
    status: parseStatus(request.query.get('status')),
    experimentVersion: optionalString(request.query.get('experimentVersion')) ?? ORB_FVG_EXPERIMENT_VERSION,
    limit: parseLimit(request.query.get('limit')),
  });

  return {
    status: 200,
    jsonBody: {
      ok: true,
      count: result.length,
      signals: result,
    },
  };
}

app.http('orbFvgSignals', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'orb-fvg/signals',
  handler: orbFvgSignals,
});

const optionalString = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const parseAssetType = (value: string | null): 'STOCK' | 'ETF' | undefined => {
  const normalized = value?.trim().toUpperCase();
  return normalized === 'STOCK' || normalized === 'ETF' ? normalized : undefined;
};

const parseDirection = (value: string | null): OrbFvgDirection | undefined => {
  const normalized = value?.trim().toUpperCase();
  return normalized === 'LONG' || normalized === 'SHORT' ? normalized : undefined;
};

const parseStatus = (value: string | null): OrbFvgStatus | undefined => {
  const normalized = value?.trim().toUpperCase();
  return ['OPEN', 'WIN', 'LOSS', 'AMBIGUOUS', 'EXPIRED'].includes(normalized ?? '')
    ? normalized as OrbFvgStatus
    : undefined;
};

const parseLimit = (value: string | null): number | undefined => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

