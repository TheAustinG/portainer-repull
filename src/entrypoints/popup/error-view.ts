import { browser } from 'wxt/browser';
import { isPortainerError } from '@/portainer/errors';
import { openSettings } from './actions';
import { button, h } from './dom';

export function errorBlock(error: unknown, baseUrl: string, onRetry: () => void): HTMLElement {
  const retry = button('Try again', { variant: 'primary', onClick: onRetry });
  const block = (messages: string[], ...actions: HTMLButtonElement[]): HTMLElement =>
    h(
      'div',
      { class: 'error', role: 'alert' },
      ...messages.map((message) => h('p', {}, message)),
      h('div', { class: 'actions' }, ...actions),
    );

  if (!isPortainerError(error)) {
    const message = error instanceof Error && error.message ? error.message : 'Something went wrong.';
    return block([message], retry);
  }

  switch (error.kind) {
    case 'network':
      return block(
        [
          `Can't reach Portainer at ${baseUrl}.`,
          'If Portainer uses a self-signed certificate, open it in a tab and accept the certificate, then try again.',
          'Otherwise, check that Portainer is running.',
        ],
        button('Open Portainer', {
          onClick: () => void browser.tabs.create({ url: baseUrl }),
        }),
        retry,
      );
    case 'timeout':
      return block(['Portainer did not respond. Check that it is running.'], retry);
    case 'invalid-response':
      return block(
        ['Portainer sent a response this add-on does not understand. Check the address in settings.'],
        button('Open settings', { variant: 'primary', onClick: openSettings }),
      );
    case 'http':
    case 'unauthorized':
      return block([error.message || 'Something went wrong.'], retry);
  }
}
