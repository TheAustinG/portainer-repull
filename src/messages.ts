import type { PortainerErrorKind } from './portainer/errors';

export interface RedeployRequest {
  type: 'redeploy';
  stackId: number;
  stackName: string;
}

export type RedeployErrorKind = PortainerErrorKind | 'busy' | 'unknown';

export type RedeployResponse = { ok: true } | { ok: false; kind: RedeployErrorKind; message: string };
