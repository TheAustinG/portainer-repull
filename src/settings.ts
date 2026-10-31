import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

export const portainerUrl = storage.defineItem<string>('local:portainerUrl');

export function normalizePortainerUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter the full Portainer address, like https://portainer.example.com:9443');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The Portainer address must start with https:// or http://');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

// Firefox lists a pattern with a port as granted but does not apply it to requests.
export function hostPermissionPattern(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

export function hasHostPermission(baseUrl: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [hostPermissionPattern(baseUrl)] });
}
