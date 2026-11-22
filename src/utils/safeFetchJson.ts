export interface SafeJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  isHtmlFallback: boolean;
  error?: string;
}

export interface SafeFetchJsonOptions extends RequestInit {
  retryOnHtml?: boolean;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

function looksLikeHtml(text: string, contentType: string | null): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('text/html')) return true;
  const trimmed = text.trimStart();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses JSON API responses safely without throwing SyntaxError on HTML SPA fallbacks or 502/504 gateway pages.
 */
export async function fetchJsonSafe<T = any>(
  input: RequestInfo | URL,
  options: SafeFetchJsonOptions = {}
): Promise<SafeJsonResult<T>> {
  const { retryOnHtml = true, retryDelayMs = 800, fetchImpl, ...init } = options;
  const doFetch = fetchImpl || fetch;
  const maxAttempts = retryOnHtml ? 2 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await doFetch(input, init);
    const contentType = res.headers?.get ? res.headers.get('content-type') : null;
    const text = await res.text();
    const isHtml = looksLikeHtml(text, contentType);

    if (isHtml) {
      if (attempt + 1 < maxAttempts && !init.signal?.aborted) {
        await sleep(retryDelayMs);
        continue;
      }
      return {
        ok: false,
        status: res.status,
        data: null,
        isHtmlFallback: true,
        error: `Endpoint returned HTML instead of JSON (HTTP ${res.status}).`,
      };
    }

    if (!text.trim()) {
      return {
        ok: res.ok,
        status: res.status,
        data: null,
        isHtmlFallback: false,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    }

    try {
      const parsed = JSON.parse(text) as T;
      if (!res.ok) {
        const errMsg =
          (parsed as any)?.error || (parsed as any)?.message || `HTTP ${res.status}`;
        return {
          ok: false,
          status: res.status,
          data: parsed,
          isHtmlFallback: false,
          error: errMsg,
        };
      }
      return {
        ok: true,
        status: res.status,
        data: parsed,
        isHtmlFallback: false,
      };
    } catch {
      return {
        ok: false,
        status: res.status,
        data: null,
        isHtmlFallback: false,
        error: `Invalid JSON response (HTTP ${res.status}).`,
      };
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    isHtmlFallback: true,
    error: 'Endpoint returned HTML instead of JSON.',
  };
}
