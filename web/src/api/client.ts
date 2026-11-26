const messages: Record<string, string> = {
  invalid: '请检查填写的内容', missing: '记录已不存在', empty: '没有可提交的内容',
  unreadable: '无法识别这份内容', model_unavailable: '模型暂不可用', server: '服务端处理失败',
};

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(messages[detail] ?? (detail || `服务返回 HTTP ${status}`));
    this.status = status;
  }
}

export function errorDetail(error: unknown) {
  if (error instanceof TypeError) return '无法连接本地服务';
  return error instanceof Error ? error.message : '服务未返回结果';
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text();
    let detail: unknown;
    try {
      const body = JSON.parse(text);
      detail = body.detail ?? body.message ?? body.error;
    } catch {
      if (response.headers.get('content-type')?.includes('text/plain')) detail = text;
    }
    throw new ApiError(response.status, typeof detail === 'string' ? detail.slice(0, 400) : '');
  }
  return response.json() as Promise<T>;
}

export function arrange(text: string) {
  return api<{ key: string; title: string; lines: string[]; href: string; actions: unknown[]; adopted: boolean }>('/api/agent/arrange', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
