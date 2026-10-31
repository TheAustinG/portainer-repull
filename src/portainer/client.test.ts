import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, type ClientOptions } from './client';
import { PortainerError } from './errors';
import { StackStatus, StackType, type ComposeRedeployBody, type GitRedeployBody, type Stack } from './types';

const baseUrl = 'https://portainer.example.com:9443/portainer';
const token = 'header.payload.signature';

const stack: Stack = {
  Id: 7,
  Name: 'media',
  Type: StackType.Compose,
  EndpointId: 3,
  Status: StackStatus.Active,
  Env: [{ name: 'TZ', value: 'UTC' }],
  GitConfig: null,
  Option: { Prune: false },
};

const composeBody: ComposeRedeployBody = {
  StackFileContent: 'services: {}\n',
  Env: [{ name: 'TZ', value: 'UTC' }],
  Prune: false,
  RepullImageAndRedeploy: true,
  PullImage: true,
};

const gitBody: GitRedeployBody = { RepullImageAndRedeploy: true, PullImage: true };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function mockFetch(response: Response | (() => Response)) {
  return vi.fn<typeof fetch>(async () => (typeof response === 'function' ? response() : response));
}

function hangingFetch() {
  return vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
  );
}

function client(fetch: typeof globalThis.fetch, options: Partial<ClientOptions> = {}) {
  return createClient({ baseUrl, token, fetch, ...options });
}

function onlyCall(fetch: ReturnType<typeof mockFetch>): { url: string; init: RequestInit } {
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

async function caught(promise: Promise<unknown>): Promise<PortainerError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PortainerError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a PortainerError');
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('requests', () => {
  it('logs in without a bearer token and resolves to the jwt', async () => {
    const fetch = mockFetch(jsonResponse({ jwt: 'new.jwt.token' }));

    await expect(client(fetch).login('admin', 'pa$$word')).resolves.toBe('new.jwt.token');

    const { url, init } = onlyCall(fetch);
    expect(url).toBe(`${baseUrl}/api/auth`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toStrictEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toStrictEqual({ Username: 'admin', Password: 'pa$$word' });
  });

  it('lists endpoints with the bearer token', async () => {
    const endpoints = [{ Id: 3, Name: 'local' }];
    const fetch = mockFetch(jsonResponse(endpoints));

    await expect(client(fetch).listEndpoints()).resolves.toStrictEqual(endpoints);

    const { url, init } = onlyCall(fetch);
    expect(url).toBe(`${baseUrl}/api/endpoints`);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toStrictEqual({ Accept: 'application/json', Authorization: `Bearer ${token}` });
    expect(init.body).toBeUndefined();
  });

  it('lists stacks', async () => {
    const fetch = mockFetch(jsonResponse([stack]));

    await expect(client(fetch).listStacks()).resolves.toStrictEqual([stack]);

    expect(onlyCall(fetch).url).toBe(`${baseUrl}/api/stacks`);
  });

  it('leaves out the Authorization header when there is no token', async () => {
    const fetch = mockFetch(jsonResponse([]));

    await client(fetch, { token: null }).listStacks();

    expect(onlyCall(fetch).init.headers).toStrictEqual({ Accept: 'application/json' });
  });

  it('gets one stack', async () => {
    const fetch = mockFetch(jsonResponse(stack));

    await expect(client(fetch).getStack(7)).resolves.toStrictEqual(stack);

    const { url, init } = onlyCall(fetch);
    expect(url).toBe(`${baseUrl}/api/stacks/7`);
    expect(init.method).toBe('GET');
  });

  it('gets a stack file as a string', async () => {
    const fetch = mockFetch(jsonResponse({ StackFileContent: 'services:\n  web: {}\n' }));

    await expect(client(fetch).getStackFile(7)).resolves.toBe('services:\n  web: {}\n');

    expect(onlyCall(fetch).url).toBe(`${baseUrl}/api/stacks/7/file`);
  });

  it('updates a compose stack on its endpoint', async () => {
    const fetch = mockFetch(jsonResponse(stack));

    await expect(client(fetch).updateStack(stack, composeBody)).resolves.toStrictEqual(stack);

    const { url, init } = onlyCall(fetch);
    expect(url).toBe(`${baseUrl}/api/stacks/7?endpointId=3`);
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toStrictEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });
    expect(JSON.parse(String(init.body))).toStrictEqual(composeBody);
  });

  it('redeploys a git stack on its endpoint', async () => {
    const fetch = mockFetch(jsonResponse(stack));

    await expect(client(fetch).redeployGitStack(stack, gitBody)).resolves.toStrictEqual(stack);

    const { url, init } = onlyCall(fetch);
    expect(url).toBe(`${baseUrl}/api/stacks/7/git/redeploy?endpointId=3`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toStrictEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });
    expect(JSON.parse(String(init.body))).toStrictEqual(gitBody);
  });

  it('uses the global fetch when none is given', async () => {
    const fetch = mockFetch(jsonResponse([]));
    vi.stubGlobal('fetch', fetch);

    await createClient({ baseUrl, token }).listStacks();

    expect(onlyCall(fetch).url).toBe(`${baseUrl}/api/stacks`);
  });
});

describe('errors', () => {
  it('maps 401 to unauthorized', async () => {
    const fetch = mockFetch(jsonResponse({ message: 'Invalid JWT token' }, { status: 401 }));

    const error = await caught(client(fetch).listStacks());

    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(error.message).toBe('Invalid JWT token');
  });

  it('maps a login 422 to unauthorized', async () => {
    const body = { message: 'Invalid credentials', details: 'Unauthorized' };
    const fetch = mockFetch(jsonResponse(body, { status: 422 }));

    const error = await caught(client(fetch).login('admin', 'wrong'));

    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(422);
    expect(error.message).toBe('Invalid credentials: Unauthorized');
  });

  it('maps a 422 outside login to an http error', async () => {
    const fetch = mockFetch(jsonResponse({ message: 'Invalid stack' }, { status: 422 }));

    const error = await caught(client(fetch).updateStack(stack, composeBody));

    expect(error.kind).toBe('http');
    expect(error.status).toBe(422);
  });

  it('joins message and details for other errors', async () => {
    const body = { message: 'Unable to deploy stack', details: 'pull access denied for app' };
    const fetch = mockFetch(jsonResponse(body, { status: 500 }));

    const error = await caught(client(fetch).updateStack(stack, composeBody));

    expect(error).toBeInstanceOf(PortainerError);
    expect(error.kind).toBe('http');
    expect(error.status).toBe(500);
    expect(error.message).toBe('Unable to deploy stack: pull access denied for app');
  });

  it('does not repeat details that match the message', async () => {
    const body = { message: 'Stack not found', details: 'Stack not found' };
    const fetch = mockFetch(jsonResponse(body, { status: 404 }));

    expect((await caught(client(fetch).getStack(7))).message).toBe('Stack not found');
  });

  it('uses the message alone when details are empty', async () => {
    const fetch = mockFetch(jsonResponse({ message: 'Access denied', details: '' }, { status: 403 }));

    expect((await caught(client(fetch).getStack(7))).message).toBe('Access denied');
  });

  it('uses trimmed text from a non-JSON error body', async () => {
    const fetch = mockFetch(new Response('  <html>\n  Bad Gateway\n</html>\n', { status: 502 }));

    const error = await caught(client(fetch).listStacks());

    expect(error.kind).toBe('http');
    expect(error.status).toBe(502);
    expect(error.message).toBe('<html> Bad Gateway </html>');
  });

  it('caps long non-JSON error text', async () => {
    const fetch = mockFetch(new Response('x'.repeat(1000), { status: 500 }));

    const { message } = await caught(client(fetch).listStacks());

    expect(message).toBe(`${'x'.repeat(300)}...`);
  });

  it('falls back to the status line when the body is empty', async () => {
    const fetch = mockFetch(new Response('', { status: 503, statusText: 'Service Unavailable' }));

    expect((await caught(client(fetch).listStacks())).message).toBe('HTTP 503 Service Unavailable');
  });

  it('falls back to the status line when a JSON error has no message', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'nope' }, { status: 500, statusText: '' }));

    expect((await caught(client(fetch).listStacks())).message).toBe('HTTP 500');
  });

  it('maps a rejected fetch to network', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });

    const error = await caught(client(fetch).listStacks());

    expect(error.kind).toBe('network');
    expect(error.status).toBeUndefined();
  });

  it('maps a 2xx body that is not JSON to invalid-response', async () => {
    const fetch = mockFetch(new Response('<!doctype html><title>Login</title>', { status: 200 }));

    expect((await caught(client(fetch).listStacks())).kind).toBe('invalid-response');
  });

  it.each([
    ['login', (c: ReturnType<typeof client>) => c.login('admin', 'secret'), { token: 1 }],
    ['listEndpoints', (c: ReturnType<typeof client>) => c.listEndpoints(), { Id: 1 }],
    ['listStacks', (c: ReturnType<typeof client>) => c.listStacks(), null],
    ['getStack', (c: ReturnType<typeof client>) => c.getStack(7), [stack]],
    ['getStackFile', (c: ReturnType<typeof client>) => c.getStackFile(7), { StackFileContent: null }],
    ['updateStack', (c: ReturnType<typeof client>) => c.updateStack(stack, composeBody), { Id: '7' }],
  ])('maps a %s response with the wrong shape to invalid-response', async (_name, call, body) => {
    const fetch = mockFetch(jsonResponse(body));

    expect((await caught(call(client(fetch)))).kind).toBe('invalid-response');
  });
});

describe('timeouts', () => {
  it.each([
    ['login', (c: ReturnType<typeof client>) => c.login('admin', 'secret')],
    ['listEndpoints', (c: ReturnType<typeof client>) => c.listEndpoints()],
    ['listStacks', (c: ReturnType<typeof client>) => c.listStacks()],
    ['getStack', (c: ReturnType<typeof client>) => c.getStack(7)],
    ['getStackFile', (c: ReturnType<typeof client>) => c.getStackFile(7)],
  ])('times out %s after 15 seconds', async (_name, call) => {
    vi.useFakeTimers();
    const fetch = hangingFetch();
    const result = caught(call(client(fetch)));

    await vi.advanceTimersByTimeAsync(14_999);
    expect(onlyCall(fetch).init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await result;
    expect(error.kind).toBe('timeout');
    expect(error.status).toBeUndefined();
  });

  it('honours a custom timeout', async () => {
    vi.useFakeTimers();
    const result = caught(client(hangingFetch(), { timeoutMs: 1_000 }).listStacks());

    await vi.advanceTimersByTimeAsync(1_000);

    expect((await result).kind).toBe('timeout');
  });

  it('clears the timer once a response arrives', async () => {
    vi.useFakeTimers();
    const fetch = mockFetch(jsonResponse([]));

    await client(fetch).listStacks();

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['updateStack', (c: ReturnType<typeof client>) => c.updateStack(stack, composeBody)],
    ['redeployGitStack', (c: ReturnType<typeof client>) => c.redeployGitStack(stack, gitBody)],
  ])('never times out %s', async (_name, call) => {
    vi.useFakeTimers();
    let resolve: (response: Response) => void = () => {};
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    let settled = false;
    const result = call(client(fetch)).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(onlyCall(fetch).init.signal).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(settled).toBe(false);
    resolve(jsonResponse(stack));
    await expect(result).resolves.toStrictEqual(stack);
  });
});
