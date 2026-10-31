import { createClient } from '@/portainer/client';
import { isPortainerError } from '@/portainer/errors';
import { saveToken } from '@/portainer/session';
import { button, h } from './dom';
import { errorBlock } from './error-view';

export interface LoginViewOptions {
  baseUrl: string;
  expired: boolean;
  onSuccess: () => void;
}

export interface LoginView {
  element: HTMLElement;
  focus: () => void;
}

export function createLoginView({ baseUrl, expired, onSuccess }: LoginViewOptions): LoginView {
  const username = h('input', {
    id: 'username',
    name: 'username',
    type: 'text',
    autocomplete: 'username',
    autocapitalize: 'off',
    spellcheck: 'false',
    required: true,
  });
  const password = h('input', {
    id: 'password',
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const submit = button('Log in', { variant: 'primary', submit: true });
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const problem = h('div', {});

  const form = h(
    'form',
    { class: 'login' },
    h('label', { for: 'username' }, 'Username'),
    username,
    h('label', { for: 'password' }, 'Password'),
    password,
    h('div', { class: 'actions' }, submit),
    status,
    problem,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void logIn();
  });

  async function logIn(): Promise<void> {
    submit.disabled = true;
    status.textContent = '';
    problem.replaceChildren();
    try {
      const token = await createClient({ baseUrl }).login(username.value, password.value);
      await saveToken(token);
      password.value = '';
      onSuccess();
      return;
    } catch (error) {
      if (isPortainerError(error) && error.kind === 'unauthorized') {
        status.textContent = 'Wrong username or password.';
        password.value = '';
        password.focus();
      } else {
        problem.replaceChildren(errorBlock(error, baseUrl, () => problem.replaceChildren()));
      }
    }
    submit.disabled = false;
  }

  const element = h(
    'div',
    { class: 'view' },
    h('h1', {}, 'Log in to Portainer'),
    expired && h('p', { class: 'notice' }, 'Your session expired. Log in again.'),
    form,
  );

  return { element, focus: () => username.focus() };
}
