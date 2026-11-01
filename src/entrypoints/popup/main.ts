import { hasHostPermission, portainerUrl, requestHostPermission } from '@/settings';
import { createClient } from '@/portainer/client';
import { isPortainerError } from '@/portainer/errors';
import { groupStacksByEnvironment } from '@/portainer/group';
import { clearToken, getToken } from '@/portainer/session';
import { hostnameOf, openSettings } from './actions';
import { button, h } from './dom';
import { errorBlock } from './error-view';
import { createListView } from './list-view';
import type { ListView } from './list-view';
import { createLoginView } from './login-view';
import './style.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

let list: ListView | null = null;
let loadId = 0;

function show(node: HTMLElement): void {
  list?.destroy();
  list = null;
  loadId += 1;
  root?.replaceChildren(node);
}

function showNoUrl(): void {
  show(
    h(
      'div',
      { class: 'view' },
      h('p', {}, 'Set your Portainer address to get started.'),
      h('div', { class: 'actions' }, button('Open settings', { variant: 'primary', onClick: openSettings })),
    ),
  );
}

function showNoPermission(baseUrl: string): void {
  const allow = button('Allow access', {
    variant: 'primary',
    onClick: () => void requestHostPermission(baseUrl).then(start),
  });
  show(
    h(
      'div',
      { class: 'view' },
      h('p', {}, `Allow access to ${hostnameOf(baseUrl)} so the add-on can reach Portainer.`),
      h('div', { class: 'actions' }, allow),
    ),
  );
}

function showLogin(baseUrl: string, expired: boolean): void {
  const login = createLoginView({ baseUrl, expired, onSuccess: () => showStacks(baseUrl) });
  show(login.element);
  login.focus();
}

function showStacks(baseUrl: string): void {
  const view = createListView({
    baseUrl,
    onRefresh: () => void loadStacks(view, baseUrl),
    onLogout: () => void logOut(baseUrl),
    onExpired: () => void expire(baseUrl),
  });
  show(view.element);
  list = view;
  void loadStacks(view, baseUrl);
}

async function logOut(baseUrl: string): Promise<void> {
  await clearToken();
  showLogin(baseUrl, false);
}

async function expire(baseUrl: string): Promise<void> {
  await clearToken();
  showLogin(baseUrl, true);
}

async function loadStacks(view: ListView, baseUrl: string): Promise<void> {
  if (list !== view) return;
  loadId += 1;
  const id = loadId;
  const current = () => id === loadId && list === view;
  view.setLoading();
  try {
    const token = await getToken();
    if (!current()) return;
    if (!token) {
      showLogin(baseUrl, true);
      return;
    }
    const client = createClient({ baseUrl, token });
    const [endpoints, stacks] = await Promise.all([client.listEndpoints(), client.listStacks()]);
    if (!current()) return;
    view.setGroups(groupStacksByEnvironment(stacks, endpoints));
  } catch (error) {
    if (!current()) return;
    if (isPortainerError(error) && error.kind === 'unauthorized') {
      await expire(baseUrl);
      return;
    }
    view.setError(error);
  }
}

async function start(): Promise<void> {
  try {
    const baseUrl = await portainerUrl.getValue();
    if (!baseUrl) {
      showNoUrl();
      return;
    }
    if (!(await hasHostPermission(baseUrl))) {
      showNoPermission(baseUrl);
      return;
    }
    if (!(await getToken())) {
      showLogin(baseUrl, false);
      return;
    }
    showStacks(baseUrl);
  } catch (error) {
    show(h('div', { class: 'view' }, errorBlock(error, '', () => void start())));
  }
}

void start();
