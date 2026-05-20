type ProspectLocalRuntimeConfig = {
  apiUrl?: string;
};

declare global {
  var __PROSPECTLOCAL_RUNTIME__: ProspectLocalRuntimeConfig | undefined;
}

const LOCAL_API_FALLBACK = 'http://127.0.0.1:8011';
const SAME_ORIGIN_SENTINEL = '__SAME_ORIGIN__';

function normalizeApiBaseUrl(value: string): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function resolveRuntimeApiUrl(): string {
  if (typeof globalThis === 'undefined') {
    return '';
  }

  return String(globalThis.__PROSPECTLOCAL_RUNTIME__?.apiUrl || '').trim();
}

function resolveEnvApiUrl(): string {
  return String(
    process.env.EXPO_PUBLIC_API_URL ||
      process.env.EXPO_PUBLIC_BACKEND_URL ||
      process.env.REACT_APP_BACKEND_URL ||
      ''
  ).trim();
}

function resolveBrowserSameOriginApiUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const hostname = window.location.hostname || '';
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!window.location.origin || isLocalHost) {
    return '';
  }

  return window.location.origin;
}

export const API_URL = normalizeApiBaseUrl(
  resolveRuntimeApiUrl() === SAME_ORIGIN_SENTINEL
    ? resolveBrowserSameOriginApiUrl() || LOCAL_API_FALLBACK
    : resolveRuntimeApiUrl() || resolveEnvApiUrl() || resolveBrowserSameOriginApiUrl() || LOCAL_API_FALLBACK
);

export function buildApiUrl(path: string): string {
  if (!path) {
    return API_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
