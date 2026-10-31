import { browser } from 'wxt/browser';
import type { RedeployRequest, RedeployResponse } from '@/messages';
import { isRedeployable } from '@/portainer/redeploy';
import { StackStatus } from '@/portainer/types';
import type { Stack, StackGroup } from '@/portainer/types';
import { hostnameOf } from './actions';
import { button, h } from './dom';
import { errorBlock } from './error-view';

const REFRESH_DELAY_MS = 1500;

type RowState = { phase: 'confirm' } | { phase: 'running' } | { phase: 'done' } | { phase: 'failed'; message: string };

export interface ListViewOptions {
  baseUrl: string;
  onRefresh: () => void;
  onLogout: () => void;
  onExpired: () => void;
}

export interface ListView {
  element: HTMLElement;
  setLoading: () => void;
  setGroups: (groups: StackGroup[]) => void;
  setError: (error: unknown) => void;
  destroy: () => void;
}

const BADGES: Record<number, { label: string; tone: string }> = {
  [StackStatus.Active]: { label: 'Active', tone: 'active' },
  [StackStatus.Inactive]: { label: 'Inactive', tone: 'inactive' },
  [StackStatus.Deploying]: { label: 'Deploying', tone: 'deploying' },
  [StackStatus.Error]: { label: 'Error', tone: 'error' },
};

function statusBadge(status: StackStatus): HTMLElement {
  const { label, tone } = BADGES[status] ?? { label: 'Unknown', tone: 'unknown' };
  return h('span', { class: `badge badge-${tone}` }, label);
}

function blockedReason(stack: Stack): string | null {
  if (!isRedeployable(stack)) return 'Kubernetes stacks are not supported';
  if (stack.Status === StackStatus.Deploying) return 'A deployment is already running';
  return null;
}

function confirmText(stack: Stack): string {
  return stack.Status === StackStatus.Inactive
    ? `${stack.Name} is stopped. Redeploying starts it. Continue?`
    : `Redeploy ${stack.Name}?`;
}

function isRedeployResponse(value: unknown): value is RedeployResponse {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';
}

export function createListView(options: ListViewOptions): ListView {
  const { baseUrl } = options;
  const element = h('div', { class: 'view' });
  const rows = new Map<number, RowState>();
  let groups: StackGroup[] | null = null;
  let failure: { error: unknown } | null = null;
  let loading = true;
  let destroyed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let focusKey: string | null = null;

  function render(): void {
    element.replaceChildren(header(), body());
    if (focusKey) {
      element.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus();
      focusKey = null;
    }
  }

  function header(): HTMLElement {
    return h(
      'header',
      { class: 'header' },
      h('h1', {}, hostnameOf(baseUrl)),
      h(
        'div',
        { class: 'actions' },
        button('Refresh', { disabled: loading, onClick: options.onRefresh }),
        button('Log out', { onClick: options.onLogout }),
      ),
    );
  }

  function body(): HTMLElement {
    if (failure) return errorBlock(failure.error, baseUrl, options.onRefresh);
    if (!groups) return h('p', { class: 'muted', role: 'status' }, 'Loading stacks...');
    if (groups.length === 0) return h('p', { class: 'muted' }, 'No stacks found.');
    return h('div', {}, ...groups.map(groupSection));
  }

  function groupSection(group: StackGroup): HTMLElement {
    return h(
      'section',
      { class: 'group' },
      h('h2', {}, group.environment.Name),
      h('ul', { class: 'rows' }, ...group.stacks.map(stackRow)),
    );
  }

  function stackRow(stack: Stack): HTMLElement {
    const state = rows.get(stack.Id);
    const blocked = blockedReason(stack);
    const busy = state?.phase === 'running' || state?.phase === 'done';
    const confirming = state?.phase === 'confirm';

    const main = h(
      'div',
      { class: 'row-main' },
      h('span', { class: 'stack-name' }, stack.Name),
      stack.GitConfig && h('span', { class: 'tag' }, 'git'),
      statusBadge(stack.Status),
      !confirming &&
        button('Redeploy', {
          disabled: busy || blocked !== null,
          focusKey: `redeploy-${stack.Id}`,
          ...(blocked ? { title: blocked } : {}),
          onClick: () => askConfirm(stack.Id),
        }),
    );

    return h(
      'li',
      { class: 'row' },
      main,
      confirming &&
        h(
          'div',
          { class: 'confirm', role: 'group', 'aria-label': `Confirm redeploy of ${stack.Name}` },
          h('span', { class: 'confirm-text' }, confirmText(stack)),
          h(
            'div',
            { class: 'actions' },
            button('Redeploy', { variant: 'danger', onClick: () => void redeploy(stack) }),
            button('Cancel', { focusKey: `cancel-${stack.Id}`, onClick: () => cancelConfirm(stack.Id) }),
          ),
        ),
      state?.phase === 'running' &&
        h(
          'div',
          { class: 'row-status', role: 'status' },
          h('span', {}, 'Redeploying...'),
          h('span', { class: 'muted' }, 'You can close this popup.'),
        ),
      state?.phase === 'done' && h('div', { class: 'row-status', role: 'status' }, 'Redeployed'),
      state?.phase === 'failed' && h('p', { class: 'row-error', role: 'alert' }, state.message),
    );
  }

  function askConfirm(stackId: number): void {
    for (const [id, state] of rows) {
      if (state.phase === 'confirm') rows.delete(id);
    }
    rows.set(stackId, { phase: 'confirm' });
    focusKey = `cancel-${stackId}`;
    render();
  }

  function cancelConfirm(stackId: number): void {
    rows.delete(stackId);
    focusKey = `redeploy-${stackId}`;
    render();
  }

  async function redeploy(stack: Stack): Promise<void> {
    rows.set(stack.Id, { phase: 'running' });
    render();

    let response: RedeployResponse;
    try {
      const request = { type: 'redeploy', stackId: stack.Id, stackName: stack.Name } satisfies RedeployRequest;
      const reply: unknown = await browser.runtime.sendMessage(request);
      response = isRedeployResponse(reply)
        ? reply
        : { ok: false, kind: 'unknown', message: 'Redeploy failed. Try again.' };
    } catch {
      response = { ok: false, kind: 'unknown', message: 'Could not reach the add-on background. Try again.' };
    }
    if (destroyed) return;

    if (response.ok) {
      rows.set(stack.Id, { phase: 'done' });
      render();
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!destroyed) options.onRefresh();
      }, REFRESH_DELAY_MS);
    } else if (response.kind === 'unauthorized') {
      options.onExpired();
    } else {
      rows.set(stack.Id, { phase: 'failed', message: response.message || 'Redeploy failed.' });
      render();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    for (const [id, state] of rows) {
      if (state.phase === 'confirm') {
        event.preventDefault();
        cancelConfirm(id);
        return;
      }
    }
  }

  document.addEventListener('keydown', onKeydown);
  render();

  return {
    element,
    setLoading() {
      clearTimeout(refreshTimer);
      loading = true;
      failure = null;
      render();
    },
    setGroups(next) {
      for (const [id, state] of rows) {
        if (state.phase === 'done') rows.delete(id);
      }
      groups = next;
      failure = null;
      loading = false;
      render();
    },
    setError(error) {
      failure = { error };
      loading = false;
      render();
    },
    destroy() {
      destroyed = true;
      clearTimeout(refreshTimer);
      document.removeEventListener('keydown', onKeydown);
    },
  };
}
