import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complete } from './adapters/model.js';

test('custom model posts chat completions and returns the reply', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const url = String(input);
    if (url.endsWith('/chat/completions')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '好的' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('missing', { status: 404 });
  };
  try {
    const text = await complete(
      { baseUrl: 'http://127.0.0.1:11434/v1/', apiKey: 'sk-test', model: 'llama3.1' },
      [{ role: 'user', content: '今天穿什么' }],
    );
    assert.equal(text, '好的');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.get('authorization'), 'Bearer sk-test');
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.model, 'llama3.1');
    assert.equal(body.temperature, 0.2);
    assert.deepEqual(body.messages, [{ role: 'user', content: '今天穿什么' }]);

    calls.length = 0;
    const again = await complete(
      { baseUrl: 'http://127.0.0.1:11434/v1/chat/completions', apiKey: '', model: '' },
      [{ role: 'user', content: [{ type: 'text', text: '看这张图' }] }],
    );
    assert.equal(again, '好的');
    assert.equal(calls[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(new Headers(calls[0].init?.headers).get('authorization'), null);
    assert.equal(JSON.parse(String(calls[0].init?.body)).model, 'local');

    calls.length = 0;
    globalThis.fetch = async () => new Response('no', { status: 401 });
    await assert.rejects(
      () => complete({ baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'sk-test', model: 'llama3.1' }, [{ role: 'user', content: 'hi' }]),
      /model_unavailable/,
    );
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 });
    await assert.rejects(
      () => complete({ baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'llama3.1' }, [{ role: 'user', content: 'hi' }]),
      /model_unavailable/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
