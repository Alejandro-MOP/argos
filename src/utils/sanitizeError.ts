import axios from 'axios';

export interface SanitizedProviderError {
  status?: number;
  statusText?: string;
  provider: string;
  endpoint?: string;
  ticker?: string;
  requestId?: string;
  message: string;
}

export interface SanitizeErrorContext {
  provider: string;
  endpoint?: string;
  ticker?: string;
}

const redactSensitiveValue = (value: string): string => {
  return value
    .replace(/(apiKey|apikey|api_key)=[^&\s]+/gi, '$1=[redacted]')
    .replace(/\/bot[^/\s]+\/sendMessage/g, '/bot[redacted]/sendMessage')
    .slice(0, 220);
};

const stripQueryString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  return redactSensitiveValue(value.split('?')[0]);
};

const getHeader = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const record = headers as Record<string, unknown>;
  const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];

  if (typeof direct === 'string') {
    return direct;
  }

  if (Array.isArray(direct) && typeof direct[0] === 'string') {
    return direct[0];
  }

  return undefined;
};

const getRequestPath = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const request = (error as { request?: unknown }).request;

  if (!request || typeof request !== 'object') {
    return undefined;
  }

  const record = request as Record<string, unknown>;
  const path = record.path ?? record.responseUrl;

  return typeof path === 'string' ? path : undefined;
};

export const sanitizeError = (
  error: unknown,
  context: SanitizeErrorContext,
): SanitizedProviderError => {
  if (axios.isAxiosError(error)) {
    const endpoint =
      stripQueryString(context.endpoint) ??
      stripQueryString(error.config?.url) ??
      stripQueryString(getRequestPath(error));
    const requestId =
      getHeader(error.response?.headers, 'x-request-id') ??
      getHeader(error.response?.headers, 'x-polygon-request-id') ??
      getHeader(error.response?.headers, 'request-id');

    return {
      status: error.response?.status,
      statusText: error.response?.statusText,
      provider: context.provider,
      endpoint,
      ticker: context.ticker,
      requestId,
      message: redactSensitiveValue(error.message),
    };
  }

  return {
    provider: context.provider,
    endpoint: stripQueryString(context.endpoint),
    ticker: context.ticker,
    message: error instanceof Error ? redactSensitiveValue(error.message) : 'Error desconocido',
  };
};
