import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { registerSettings } from './routes/settings.js';
import { localOllamaBase, modelDestination } from '../../shared/modelEndpoint.js';

const app = new Hono();
registerSettings(app, { profile: { findUniqueOrThrow: async () => ({ modelBase: localOllamaBase, modelName: 'fake-model', modelKey: 'test-only' }) } } as unknown as PrismaClient);
const check = (body?: unknown) => app.request('/api/model/check', { method: 'POST', body: JSON.stringify(body) });

test('discover Ollama and compatible models from the configured destination only', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    if (url === 'http://127.0.0.1:11434/api/tags') {
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-only');
      return Response.json({ models: [{ name: 'fake-b' }, { name: 'fake-a' }, { name: 'fake-a' }] });
    }
    assert.equal(url, 'https://provider.invalid/v1/models');
    assert.equal(new Headers(options.headers).get('authorization'), null);
    return Response.json({ data: [{ id: 'fake-compatible' }] });
  });
  assert.deepEqual(await (await check({ capability: 'list' })).json(), { models: ['fake-a', 'fake-b'] });
  assert.deepEqual(await (await check({ capability: 'list', baseUrl: 'https://provider.invalid/v1/chat/completions' })).json(), { models: ['fake-compatible'] });
  assert.equal(calls.length, 2);
});

test('support text and image separately and ignore client-provided probe content', async t => {
  let imageReply = 'OK';
  const contents: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions');
    const { model, messages } = JSON.parse(String(options.body));
    assert.equal(model, 'fake-model');
    assert.equal(messages.length, 1);
    const content = messages[0].content;
    contents.push(content);
    if (Array.isArray(content)) {
      assert.match(content[1].image_url.url, /^data:image\/png;base64,iVBOR/);
      assert.doesNotMatch(content[0].text, /red/i);
    } else { assert.equal(content, 'Reply with the single word OK.'); }
    assert.doesNotMatch(JSON.stringify(content), /private-input/);
    return Response.json({ choices: [{ message: { content: Array.isArray(content) ? imageReply : 'OK' } }] });
  });
  assert.equal((await check()).status, 200);
  assert.equal((await check({ capability: 'image', image: 'private-input' })).status, 502);
  imageReply = 'Red.';
  assert.deepEqual(await (await check({ capability: 'image' })).json(), { model: 'fake-model', capability: 'image' });
  assert.equal(contents.length, 3);
});

test('handle unavailable endpoints and malformed lists without exposing provider output', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    if (url.endsWith('/api/tags')) return new Response(null, { status: 404 });
    return Response.json({ error: 'provider-private-detail' });
  });
  const failed = await check({ capability: 'list' });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /provider-private-detail/);
  assert.equal((await check({ capability: 'other' })).status, 400);
  assert.equal((await check({ capability: 'list', baseUrl: 'file:///tmp/test' })).status, 400);
  assert.deepEqual(urls, ['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/v1/models']);
});

test('surface a timeout without retrying the probe or disclosing provider data', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('private provider diagnostic', 'TimeoutError');
  });
  const response = await check({ capability: 'image' });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: '连接超时，请检查服务后重试' });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('destination labels distinguish loopback, remote and disabled endpoints without leaking URL secrets', () => {
  assert.match(modelDestination('http://[::1]:11434/v1'), /本机模型.*\[::1\]/);
  assert.match(modelDestination('https://provider.invalid/v1'), /远程模型.*provider.invalid/);
  assert.match(modelDestination(''), /未配置/);
  assert.doesNotMatch(modelDestination('https://provider.invalid/?secret=test-only'), /test-only/);
});
