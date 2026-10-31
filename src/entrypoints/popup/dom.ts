type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) node.setAttribute(name, '');
    else if (value !== false) node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export interface ButtonOptions {
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  title?: string;
  focusKey?: string;
  submit?: boolean;
  onClick?: () => void;
}

export function button(label: string, options: ButtonOptions = {}): HTMLButtonElement {
  const node = h('button', {
    type: options.submit ? 'submit' : 'button',
    class: `btn btn-${options.variant ?? 'secondary'}`,
    disabled: options.disabled ?? false,
    ...(options.title ? { title: options.title } : {}),
    ...(options.focusKey ? { 'data-focus': options.focusKey } : {}),
  }, label);
  if (options.onClick) node.addEventListener('click', options.onClick);
  return node;
}
