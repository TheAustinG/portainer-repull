import { PortainerError } from './errors';
import type { ComposeRedeployBody, Endpoint, GitRedeployBody, Stack } from './types';

export interface PortainerClient {
  login(username: string, password: string): Promise<string>;
  listEndpoints(): Promise<Endpoint[]>;
  listStacks(): Promise<Stack[]>;
  getStack(id: number): Promise<Stack>;
  getStackFile(id: number): Promise<string>;
  updateStack(stack: Stack, body: ComposeRedeployBody): Promise<Stack>;
  redeployGitStack(stack: Stack, body: GitRedeployBody): Promise<Stack>;
}

export interface ClientOptions {
  baseUrl: string;
  token?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

const MAX_ERROR_TEXT_LENGTH = 300;

interface RequestSpec {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
  timed: boolean;
  login?: boolean;
}

export function createClient(options: ClientOptions): PortainerClient {
  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(spec: RequestSpec): Promise<{ response: Response; text: string }> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = { method: spec.method, headers, credentials: 'omit' };
    if (spec.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(spec.body);
    }
    if (options.token && !spec.login) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (spec.timed) {
      const controller = new AbortController();
      init.signal = controller.signal;
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      const response = await fetchImpl(`${options.baseUrl}/api${spec.path}`, init);
      const text = await response.text();
      return { response, text };
    } catch {
      if (timedOut) {
        throw new PortainerError('timeout', 'Portainer did not respond in time.');
      }
      throw new PortainerError('network', 'Could not reach Portainer.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(spec: RequestSpec): Promise<unknown> {
    const { response, text } = await send(spec);
    if (!response.ok) {
      const message = errorMessage(text, response);
      if (response.status === 401 || (spec.login && response.status === 422)) {
        throw new PortainerError('unauthorized', message, response.status);
      }
      throw new PortainerError('http', message, response.status);
    }
    const data = parseJson(text);
    if (data === undefined) {
      throw invalidResponse();
    }
    return data;
  }

  async function requestStack(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<Stack> {
    const data = await request({ method, path, body, timed: method === 'GET' });
    if (!isRecord(data) || typeof data.Id !== 'number') {
      throw invalidResponse();
    }
    return data as unknown as Stack;
  }

  async function requestList<T>(path: string): Promise<T[]> {
    const data = await request({ method: 'GET', path, timed: true });
    if (!Array.isArray(data)) {
      throw invalidResponse();
    }
    return data as T[];
  }

  return {
    async login(username, password) {
      const data = await request({
        method: 'POST',
        path: '/auth',
        body: { Username: username, Password: password },
        timed: true,
        login: true,
      });
      if (!isRecord(data) || typeof data.jwt !== 'string' || data.jwt === '') {
        throw invalidResponse();
      }
      return data.jwt;
    },

    listEndpoints() {
      return requestList<Endpoint>('/endpoints');
    },

    listStacks() {
      return requestList<Stack>('/stacks');
    },

    getStack(id) {
      return requestStack('GET', `/stacks/${id}`);
    },

    async getStackFile(id) {
      const data = await request({ method: 'GET', path: `/stacks/${id}/file`, timed: true });
      if (!isRecord(data) || typeof data.StackFileContent !== 'string') {
        throw invalidResponse();
      }
      return data.StackFileContent;
    },

    updateStack(stack, body) {
      return requestStack('PUT', `/stacks/${stack.Id}?endpointId=${stack.EndpointId}`, body);
    },

    redeployGitStack(stack, body) {
      return requestStack('PUT', `/stacks/${stack.Id}/git/redeploy?endpointId=${stack.EndpointId}`, body);
    },
  };
}

function errorMessage(text: string, response: Response): string {
  const data = parseJson(text);
  if (isRecord(data) && typeof data.message === 'string' && data.message.trim() !== '') {
    const message = data.message.trim();
    const details = typeof data.details === 'string' ? data.details.trim() : '';
    return details !== '' && details !== message ? `${message}: ${details}` : message;
  }
  const plain = text.replace(/\s+/g, ' ').trim();
  if (data === undefined && plain !== '') {
    return plain.length > MAX_ERROR_TEXT_LENGTH ? `${plain.slice(0, MAX_ERROR_TEXT_LENGTH)}...` : plain;
  }
  return `HTTP ${response.status} ${response.statusText}`.trim();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): PortainerError {
  return new PortainerError(
    'invalid-response',
    'The server answered, but not the way Portainer does. Check the Portainer address.',
  );
}
