export class ApiError extends Error {
  status: number;
  detail?: { error?: string; register?: boolean };
  constructor(status: number, detail?: { error?: string; register?: boolean }) {
    super(String(status));
    this.name = 'ApiError';
    this.status = status; this.detail = detail;
  }
}

export function isRejected(error: unknown) {
  return error instanceof ApiError && (error.status === -1 || (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 425));
}

let onUnauthorized = () => {};
let sessionVersion = 0;
const requests = new Set<AbortController>();
export function resetApiSession() {
  sessionVersion++;
  for (const request of requests) request.abort();
  requests.clear();
}
export function setUnauthorizedHandler(handler: () => void) { onUnauthorized = handler; }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const version = sessionVersion;
  const controller = new AbortController();
  requests.add(controller);
  const timeout = AbortSignal.timeout(35_000);
  const signal = AbortSignal.any([controller.signal, timeout, ...(init?.signal ? [init.signal] : [])]);
  try {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-client-version', '2');
    if (init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()) && !path.startsWith('/api/auth/')) {
      if (!headers.has('idempotency-key')) headers.set('idempotency-key', crypto.randomUUID());
    }
    const response = await fetch(path, { ...init, signal, credentials: 'include', headers });
    const body = await response.json();
    if (version !== sessionVersion || controller.signal.aborted) throw new ApiError(-1);
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
    if (!response.ok) throw new ApiError(response.status, body);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (version !== sessionVersion || controller.signal.aborted || init?.signal?.aborted) throw new ApiError(-1);
    throw new ApiError(timeout.aborted ? 408 : 0);
  } finally { requests.delete(controller); }
}

export function arrange(text: string, signal?: AbortSignal) {
  return api<{ key: string; title: string; lines: string[]; href: string; actions: unknown[]; adopted: boolean }>('/api/agent/arrange', {
    method: 'POST', signal, body: JSON.stringify({ text }),
  });
}
