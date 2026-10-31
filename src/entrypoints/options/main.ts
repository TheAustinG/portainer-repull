import { browser } from 'wxt/browser';
import { clearToken } from '@/portainer/session';
import { hasHostPermission, hostPermissionPattern, normalizePortainerUrl, portainerUrl } from '@/settings';
import './style.css';

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const form = must<HTMLFormElement>('settings');
const input = must<HTMLInputElement>('portainer-url');
const save = must<HTMLButtonElement>('save');
const grant = must<HTMLButtonElement>('grant');
const status = must<HTMLElement>('status');

let grantUrl: string | null = null;

function setStatus(message: string, tone: 'ok' | 'error' | 'neutral'): void {
  status.textContent = message;
  status.dataset.tone = tone;
}

function offerGrant(url: string | null): void {
  grantUrl = url;
  grant.hidden = url === null;
}

function requestAccess(url: string): Promise<boolean> {
  return browser.permissions.request({ origins: [hostPermissionPattern(url)] }).catch(() => false);
}

function deniedMessage(url: string): string {
  return `Firefox access to ${new URL(url).hostname} was not granted. The add-on cannot reach Portainer without it.`;
}

async function saveSettings(): Promise<void> {
  let url: string;
  try {
    url = normalizePortainerUrl(input.value);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Enter a valid Portainer address.', 'error');
    return;
  }

  // Firefox only counts the prompt as user-initiated if nothing was awaited before it.
  const granted = requestAccess(url);
  save.disabled = true;
  setStatus('Saving...', 'neutral');
  try {
    const previous = await portainerUrl.getValue();
    await portainerUrl.setValue(url);
    if (previous !== url) await clearToken();
    input.value = url;
    if (await granted) {
      offerGrant(null);
      setStatus('Saved.', 'ok');
    } else {
      offerGrant(url);
      setStatus(`Saved, but ${deniedMessage(url)}`, 'error');
    }
  } catch {
    setStatus('Could not save the address. Try again.', 'error');
  } finally {
    save.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveSettings();
});

grant.addEventListener('click', () => {
  const url = grantUrl;
  if (!url) return;
  const granted = requestAccess(url);
  void granted.then((ok) => {
    if (ok) {
      offerGrant(null);
      setStatus('Access granted.', 'ok');
    } else {
      setStatus(deniedMessage(url), 'error');
    }
  });
});

async function init(): Promise<void> {
  const stored = await portainerUrl.getValue();
  if (!stored) return;
  input.value = stored;
  if (!(await hasHostPermission(stored))) offerGrant(stored);
}

init().catch(() => setStatus('Could not load the saved address.', 'error'));
