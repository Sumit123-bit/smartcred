import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

let accessTokenMemory: string | null = null;
let csrfTokenMemory: string | null = null;

const SESSION_BACKUP_KEY = 'smartcred_iframe_session';

export function setAuthTokens(params: {
  accessToken: string | null;
  csrfToken?: string | null;
  sessionBackup?: string | null;
}) {
  accessTokenMemory = params.accessToken;
  if (params.csrfToken !== undefined) {
    csrfTokenMemory = params.csrfToken;
  }
  if (params.sessionBackup !== undefined) {
    try {
      if (params.sessionBackup) {
        sessionStorage.setItem(SESSION_BACKUP_KEY, params.sessionBackup);
      } else {
        sessionStorage.removeItem(SESSION_BACKUP_KEY);
      }
    } catch {
      // Ignore storage restrictions
    }
  }
}

export function getStoredSessionBackup(): string | null {
  try {
    return sessionStorage.getItem(SESSION_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function clearAuthTokens() {
  accessTokenMemory = null;
  try {
    sessionStorage.removeItem(SESSION_BACKUP_KEY);
  } catch {
    // Ignore
  }
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export async function ensureCsrfToken(): Promise<string> {
  const fromCookie = readCookieValue('smartcred_csrf');
  if (fromCookie) {
    csrfTokenMemory = fromCookie;
    return fromCookie;
  }
  if (csrfTokenMemory) return csrfTokenMemory;
  const res = await axios.get<{ csrfToken: string }>('/api/auth/csrf', {
    withCredentials: true,
  });
  csrfTokenMemory = res.data.csrfToken;
  return csrfTokenMemory;
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (accessTokenMemory) {
    config.headers.Authorization = `Bearer ${accessTokenMemory}`;
  }

  const method = (config.method || 'get').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await ensureCsrfToken();
    config.headers['X-CSRF-Token'] = token;

    const backup = getStoredSessionBackup();
    if (backup && (config.url?.includes('/auth/logout') || config.url?.includes('/auth/refresh'))) {
      config.headers['X-Session-Backup'] = backup;
    }
  }

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string }>) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean; _csrfRetry?: boolean })
      | undefined;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        const backup = getStoredSessionBackup();
        refreshPromise = axios
          .post<{
            accessToken: string;
            csrfToken: string;
            sessionBackup?: string;
          }>(
            '/api/auth/refresh',
            {},
            {
              withCredentials: true,
              headers: backup ? { 'X-Session-Backup': backup } : {},
            }
          )
          .then((res) => {
            setAuthTokens({
              accessToken: res.data.accessToken,
              csrfToken: res.data.csrfToken,
              sessionBackup: res.data.sessionBackup,
            });
            return res.data.accessToken;
          })
          .catch(() => {
            clearAuthTokens();
            return null;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newAccess = await refreshPromise;
      if (newAccess) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      }
    }

    if (
      error.response?.status === 403 &&
      error.response.data?.error?.includes('CSRF') &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true;
      csrfTokenMemory = null;
      const freshCsrf = await axios.get<{ csrfToken: string }>('/api/auth/csrf', {
        withCredentials: true,
      });
      csrfTokenMemory = freshCsrf.data.csrfToken;
      originalRequest.headers['X-CSRF-Token'] = csrfTokenMemory;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export function extractApiError(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: string } | undefined)?.error;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
