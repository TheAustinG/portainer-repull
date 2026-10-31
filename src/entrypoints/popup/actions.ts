import { browser } from 'wxt/browser';

export function hostnameOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

export function openSettings(): void {
  void browser.runtime.openOptionsPage().then(() => window.close());
}
