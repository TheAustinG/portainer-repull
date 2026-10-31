import type { PortainerClient } from './client';
import type { ComposeRedeployBody, GitRedeployBody, Stack } from './types';

export function isRedeployable(_stack: Stack): boolean {
  throw new Error('not implemented');
}

export function buildComposeRedeployBody(_stack: Stack, _stackFileContent: string): ComposeRedeployBody {
  throw new Error('not implemented');
}

export function buildGitRedeployBody(): GitRedeployBody {
  throw new Error('not implemented');
}

export async function redeployStack(_client: PortainerClient, _stackId: number): Promise<Stack> {
  throw new Error('not implemented');
}
