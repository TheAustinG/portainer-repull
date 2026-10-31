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

export function createClient(_options: ClientOptions): PortainerClient {
  throw new Error('not implemented');
}
