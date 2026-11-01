import { browser } from 'wxt/browser';
import type { RedeployRequest, RedeployResponse } from '@/messages';
import { createClient } from '@/portainer/client';
import { isPortainerError } from '@/portainer/errors';
import { redeployStack } from '@/portainer/redeploy';
import { clearToken, getToken } from '@/portainer/session';
import { portainerUrl } from '@/settings';

const KEEPALIVE_INTERVAL_MS = 20_000;
const SESSION_EXPIRED = 'Your Portainer session expired. Open the add-on and log in again.';

const redeploying = new Set<number>();

export function isRedeployRequest(message: unknown): message is RedeployRequest {
  if (typeof message !== 'object' || message === null) return false;
  const { type, stackId, stackName } = message as Record<string, unknown>;
  return type === 'redeploy' && typeof stackId === 'number' && typeof stackName === 'string';
}

export async function handleRedeploy({ stackId, stackName }: RedeployRequest): Promise<RedeployResponse> {
  if (redeploying.has(stackId)) {
    return { ok: false, kind: 'busy', message: `${stackName} is already being redeployed.` };
  }
  redeploying.add(stackId);
  // Firefox stops an idle event page after 30 seconds. A pending fetch does not count as
  // activity, but an extension API call does, and image pulls can take minutes.
  const keepAlive = setInterval(() => {
    browser.runtime.getPlatformInfo().catch(() => undefined);
  }, KEEPALIVE_INTERVAL_MS);
  try {
    const response = await redeploy(stackId).catch(failure);
    await notify(stackName, response).catch(() => undefined);
    return response;
  } finally {
    clearInterval(keepAlive);
    redeploying.delete(stackId);
  }
}

async function redeploy(stackId: number): Promise<RedeployResponse> {
  const [baseUrl, token] = await Promise.all([portainerUrl.getValue(), getToken()]);
  if (!baseUrl || !token) return { ok: false, kind: 'unauthorized', message: SESSION_EXPIRED };
  await redeployStack(createClient({ baseUrl, token }), stackId);
  return { ok: true };
}

async function failure(error: unknown): Promise<RedeployResponse> {
  if (!isPortainerError(error)) {
    const message = error instanceof Error && error.message ? error.message : 'Something went wrong.';
    return { ok: false, kind: 'unknown', message };
  }
  if (error.kind === 'unauthorized') {
    await clearToken().catch(() => undefined);
    return { ok: false, kind: 'unauthorized', message: SESSION_EXPIRED };
  }
  return { ok: false, kind: error.kind, message: error.message };
}

function notify(stackName: string, response: RedeployResponse): Promise<string> {
  return browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/96.png'),
    title: response.ok ? `Redeployed ${stackName}` : `Could not redeploy ${stackName}`,
    message: response.ok ? 'Pulled the latest images and restarted the stack.' : response.message,
  });
}
