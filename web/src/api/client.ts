const messages: Record<string, string> = {
  invalid: '请检查填写的内容', missing: '记录已不存在', empty: '没有可提交的内容',
  unreadable: '无法识别这份内容', model_unavailable: '模型暂不可用', server: '服务端处理失败',
  forbidden: '当前账号无法执行此操作', unauthorized: '登录已失效，请重新登录', taken: '用户名已被使用',
  key_reused: '提交标识已用于其他操作，请刷新后再试', operation_uncertain: '这次操作可能已执行，请刷新核对后再操作',
};

export class ApiError extends Error {
  readonly status: number;
  readonly needsSetup: boolean;
  readonly uncertain: boolean;
  constructor(status: number, detail: string, needsSetup = false) {
    super(messages[detail] ?? (detail || `服务返回 HTTP ${status}`));
    this.status = status;
    this.needsSetup = needsSetup;
    this.uncertain = detail === 'operation_uncertain';
  }
}

export function errorDetail(error: unknown) {
  if (error instanceof TypeError) return '无法连接本地服务';
  return error instanceof Error ? error.message : '服务未返回结果';
}

const publicAuth = new Set(['/api/auth/session', '/api/auth/login', '/api/auth/register', '/api/auth/logout']);
let activeSession: string | null = null;
let sessionAbort = new AbortController();
let onUnauthorized: (() => void) | undefined;

export function resetApiSession(hint: string | null = null) {
  sessionAbort.abort();
  sessionAbort = new AbortController();
  activeSession = hint;
}

export function setUnauthorizedHandler(handler?: () => void) {
  onUnauthorized = handler;
}

export function mutationKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const protectedRequest = !publicAuth.has(path);
  const session = sessionAbort.signal;
  const timeout = AbortSignal.timeout(35_000);
  const signal = AbortSignal.any([session, timeout, ...(init?.signal ? [init.signal] : [])]);
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  if (activeSession && protectedRequest) headers.set('x-account-session', activeSession);
  if (protectedRequest && !path.startsWith('/api/auth/') && !['GET', 'HEAD', 'OPTIONS'].includes((init?.method ?? 'GET').toUpperCase()) && !headers.has('idempotency-key')) {
    headers.set('idempotency-key', mutationKey());
  }
  try {
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin', signal });
    if (!response.ok) {
      const text = await response.text();
      let detail: unknown;
      let needsSetup = false;
      try {
        const body = JSON.parse(text);
        detail = body?.detail ?? body?.message ?? body?.error;
        needsSetup = body?.needsSetup === true;
      } catch {
        if (response.headers.get('content-type')?.includes('text/plain')) detail = text;
      }
      if (response.status === 401 && protectedRequest && !session.aborted) onUnauthorized?.();
      throw new ApiError(response.status, typeof detail === 'string' ? detail.slice(0, 400) : '', needsSetup);
    }
    const body = await response.json() as T;
    session.throwIfAborted();
    return body;
  } catch (error) {
    if (timeout.aborted && !(error instanceof ApiError)) throw new ApiError(408, '连接超时，请重试');
    throw error;
  }
}

export function arrange(text: string, signal?: AbortSignal) {
  return api<{ key: string; title: string; lines: string[]; href: string; actions: unknown[]; adopted: boolean }>('/api/agent/arrange', {
    method: 'POST',
    signal,
    body: JSON.stringify({ text }),
  });
}
