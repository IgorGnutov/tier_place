# Кошик, оформлення замовлення та адмінка замовлень — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct-to-Telegram "Купити" button on product cards with a shopping cart + checkout form; on submit, the order is written to a Google Sheet and duplicated to a Telegram bot chat, and shows up in a new "Замовлення" tab in `/admin`.

**Architecture:** Client-side cart state in `localStorage` (`src/js/cart.ts`) drives a slide-out drawer (`src/js/cart-ui.ts`) with a checkout form. Submission POSTs to the same Google Apps Script Web App that already backs `/admin` (`CONTENT_API_URL`), which gains three new `doPost` actions (`order`, `listOrders`, `updateOrderStatus`) writing to/reading from a new "Замовлення" sheet and calling the Telegram Bot API. `/admin` gains a tab switcher ("Замовлення" first/default, "Тексти" second) behind the existing session password.

**Tech Stack:** Vite + vanilla TypeScript (no framework), Papa Parse for CSV, Google Apps Script (`.gs`, runs in Google's environment, not part of the npm project), Telegram Bot API via `UrlFetchApp`.

**Spec:** `docs/superpowers/specs/2026-08-27-cart-checkout-orders-design.md`

## Global Constraints

- Primary language for code comments, commit-facing docs, and UI copy is Ukrainian (per `CLAUDE.md`).
- No automated test framework exists in this repo — `npm run typecheck` (`tsc --noEmit`) is the only automated check. There is no linter. Every task's "verify" step relies on `typecheck` plus a manual check in `npm run dev` (or, for the Apps Script task, a manual deploy + `curl`/browser check that only the human maintainer can run against a real Google Sheet).
- No online payment, no stock reservation/decrement — order just records intent (from the spec's non-goals).
- `admin/apps-script/Code.gs` is one file deployed as a whole to Google Apps Script — it cannot be partially deployed, so it is one task.
- Cart persists across reloads via `localStorage` (not sessionStorage) — it is not a session-scoped concept.
- The Google Sheet "Замовлення" columns, in order, are fixed by the spec: `order_id, timestamp, status, name, phone, delivery_method, np_city, np_branch, comment, items, total`.
- Order status values are exactly `Нове` and `Опрацьовано` (Ukrainian, no other statuses).
- `BOT_TOKEN` and `CHAT_ID` live in Apps Script Script Properties, alongside the existing `ADMIN_PASSWORD` — never in client code or `src/config.ts`.
- A failed Telegram send must never prevent or roll back the Google Sheet write (the sheet is the "long memory" per the spec).
- Reuse existing design tokens from `src/styles/variables.css` (`--space-*`, `--radius-*`, `--color-*`, `--fs-*`, `--transition`, `--ease`) — do not invent new ad-hoc values.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/js/cart.ts` | new | Cart state (items, qty, total), `localStorage` persistence, change notifications |
| `src/js/order-api.ts` | new | POSTs a finished order to `CONTENT_API_URL` |
| `src/js/cart-ui.ts` | new | Drawer DOM, checkout form, submit flow, badge updates |
| `src/styles/cart.css` | new | All cart/drawer/checkout styling |
| `src/styles/main.css` | modify | Import `cart.css` |
| `index.html` | modify | Cart icon + badge in header |
| `src/main.ts` | modify | Call `initCart()` |
| `src/js/render-products.ts` | modify | "Купити" adds to cart instead of opening Telegram; drop copy-to-clipboard button |
| `src/styles/products.css` | modify | Drop now-unused `.product-card__copy` rules |
| `admin/apps-script/Code.gs` | modify | `order` / `listOrders` / `updateOrderStatus` actions + "Замовлення" sheet + Telegram send |
| `src/admin/api.ts` | new | Shared `callApi`, password session helpers, `showStatus` (extracted from old `main.ts`) |
| `src/admin/content-tab.ts` | new | "Тексти" tab (extracted from old `main.ts`) |
| `src/admin/orders.ts` | new | "Замовлення" tab |
| `src/admin/main.ts` | rewrite | Password gate + tab shell/router (thin) |
| `src/styles/admin.css` | modify | Tab switcher + order card styles |
| `README.md` | modify | Bot creation + Script Properties steps |
| `CLAUDE.md` | modify | Architecture section for the cart/order subsystem |

---

### Task 1: Cart state module

**Files:**
- Create: `src/js/cart.ts`

**Interfaces:**
- Consumes: nothing (leaf module)
- Produces: `CartItem` type (`{ key: string; title: string; sizeLine: string; price: number | null; qty: number }`), `getItems(): CartItem[]`, `addItem(item: { key; title; sizeLine; price }, qty?: number): void`, `updateQty(key: string, qty: number): void`, `removeItem(key: string): void`, `clear(): void`, `getTotal(): number`, `getCount(): number`, `onChange(cb: () => void): () => void` — all consumed by Task 3 (`cart-ui.ts`) and Task 4 (`render-products.ts`)

- [ ] **Step 1: Write `src/js/cart.ts`**

```ts
// Стан кошика: додавання/зміна кількості/видалення товарів, персистентність у localStorage.
// Кошик спільний для шин і дисків — один список позицій незалежно від каталогу.
export interface CartItem {
  key: string;
  title: string;
  sizeLine: string;
  price: number | null;
  qty: number;
}

type NewCartItem = Omit<CartItem, 'qty'>;

const STORAGE_KEY = 'tire_place_cart_v1';

function loadFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let items: CartItem[] = loadFromStorage();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage може бути недоступний (приватний режим, квота) — кошик просто не переживе перезавантаження.
  }
}

function notify(): void {
  persist();
  listeners.forEach((cb) => cb());
}

export function getItems(): CartItem[] {
  return items;
}

export function addItem(item: NewCartItem, qty = 1): void {
  const existing = items.find((i) => i.key === item.key);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({ ...item, qty });
  }
  notify();
}

export function updateQty(key: string, qty: number): void {
  if (qty <= 0) {
    removeItem(key);
    return;
  }
  const existing = items.find((i) => i.key === key);
  if (existing) {
    existing.qty = qty;
    notify();
  }
}

export function removeItem(key: string): void {
  items = items.filter((i) => i.key !== key);
  notify();
}

export function clear(): void {
  items = [];
  notify();
}

export function getTotal(): number {
  return items.reduce((sum, i) => sum + (i.price ?? 0) * i.qty, 0);
}

export function getCount(): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

export function onChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this file has no consumers yet, so it only needs to compile standalone).

- [ ] **Step 3: Manual smoke check**

Run `npm run dev`, open the site in a browser, open devtools console, and paste:

```js
const cart = await import('/src/js/cart.ts');
cart.addItem({ key: 'a', title: 'Test', sizeLine: '205/55 R16', price: 1000 });
cart.addItem({ key: 'a', title: 'Test', sizeLine: '205/55 R16', price: 1000 });
console.log(cart.getItems(), cart.getTotal(), cart.getCount());
```

Expected: one item with `qty: 2`, `getTotal() === 2000`, `getCount() === 2`. Reload the page and re-run `cart.getItems()` (fresh import) — the item should still be there (persisted).

- [ ] **Step 4: Commit**

```bash
git add src/js/cart.ts
git commit -m "$(cat <<'EOF'
Add cart state module with localStorage persistence

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Order submission API client

**Files:**
- Create: `src/js/order-api.ts`

**Interfaces:**
- Consumes: `CONTENT_API_URL` from `src/config.ts` (existing)
- Produces: `OrderItemPayload`, `OrderPayload`, `OrderResult` types, `submitOrder(payload: OrderPayload): Promise<OrderResult>` — consumed by Task 3 (`cart-ui.ts`)

- [ ] **Step 1: Write `src/js/order-api.ts`**

```ts
// Відправка оформленого замовлення на Apps Script Web App (той самий CONTENT_API_URL, що й /admin).
import { CONTENT_API_URL } from '../config';

export interface OrderItemPayload {
  title: string;
  sizeLine: string;
  price: number | null;
  qty: number;
}

export interface OrderPayload {
  name: string;
  phone: string;
  deliveryMethod: 'pickup' | 'np';
  npCity?: string;
  npBranch?: string;
  comment?: string;
  items: OrderItemPayload[];
  total: number;
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  error?: string;
}

// body без явного Content-Type лишається text/plain — так Apps Script Web App уникає CORS preflight
// (той самий прийом, що й у src/admin/main.ts для action 'save'/'verify').
export async function submitOrder(payload: OrderPayload): Promise<OrderResult> {
  if (!CONTENT_API_URL) {
    return { ok: false, error: 'Онлайн-замовлення ще не налаштовано на цьому сайті' };
  }

  try {
    const response = await fetch(CONTENT_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'order', ...payload }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return { ok: false, error: 'Не вдалося з’єднатися з сервером. Перевірте інтернет і спробуйте ще раз.' };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

With `npm run dev` running, in the browser devtools console:

```js
const { submitOrder } = await import('/src/js/order-api.ts');
console.log(await submitOrder({ name: 'Тест', phone: '+380000000000', deliveryMethod: 'pickup', items: [], total: 0 }));
```

Expected: since `CONTENT_API_URL` is currently the existing admin-content endpoint (which doesn't know the `order` action yet — that's Task 5), you should see either `{ ok: false, error: 'Невідома дія' }` (script reached, action unrecognized) or a network-shaped error object — either way, **no thrown exception**, confirming the function always resolves.

- [ ] **Step 4: Commit**

```bash
git add src/js/order-api.ts
git commit -m "$(cat <<'EOF'
Add order submission API client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cart UI — header icon, drawer, checkout form, styles

**Files:**
- Create: `src/js/cart-ui.ts`
- Create: `src/styles/cart.css`
- Modify: `src/styles/main.css`
- Modify: `index.html:218-226` (header actions)
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `getItems`, `updateQty`, `removeItem`, `clear`, `getTotal`, `getCount`, `onChange`, `CartItem` from `src/js/cart.ts` (Task 1); `submitOrder`, `OrderPayload` from `src/js/order-api.ts` (Task 2); `showToast` from `src/js/telegram.ts` (existing)
- Produces: `initCart(): void`, called from `src/main.ts`; DOM ids `#cart-toggle`, `#cart-badge` (in `index.html`), `#cart-drawer`, `#cart-overlay`, `#cart-body`, `#cart-close` (created at runtime) — consumed by Task 4 only via the `addItem` import (Task 4 does not touch cart-ui internals)

- [ ] **Step 1: Add the cart icon to the header**

In `index.html`, the header actions block currently reads (around line 218):

```html
      <div class="header-actions">
        <a class="header-phone" href="tel:+380980719393" aria-label="Подзвонити: +38 (098) 071-93-93">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.2 1L6.6 10.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          <span class="header-phone__text">+38 (098) 071-93-93</span>
        </a>
        <button class="burger" id="burger" aria-expanded="false" aria-controls="main-nav" aria-label="Відкрити меню">
          <span class="burger__box"><span></span></span>
        </button>
      </div>
```

Insert a cart toggle button between the phone link and the burger button:

```html
      <div class="header-actions">
        <a class="header-phone" href="tel:+380980719393" aria-label="Подзвонити: +38 (098) 071-93-93">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.2 1L6.6 10.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          <span class="header-phone__text">+38 (098) 071-93-93</span>
        </a>
        <button class="cart-toggle" id="cart-toggle" type="button" aria-label="Кошик">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h8.6a2 2 0 0 0 2-1.6L21.5 8H6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9.5" cy="20" r="1.4" fill="currentColor"/><circle cx="17.5" cy="20" r="1.4" fill="currentColor"/></svg>
          <span class="cart-toggle__badge" id="cart-badge" hidden>0</span>
        </button>
        <button class="burger" id="burger" aria-expanded="false" aria-controls="main-nav" aria-label="Відкрити меню">
          <span class="burger__box"><span></span></span>
        </button>
      </div>
```

- [ ] **Step 2: Write `src/styles/cart.css`**

```css
.cart-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color var(--transition), background-color var(--transition);
}

.cart-toggle:hover,
.cart-toggle:focus-visible {
  border-color: var(--color-border-strong);
  background: var(--color-bg-raised);
}

.cart-toggle__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-accent);
  color: var(--color-accent-contrast);
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-accent);
}

.cart-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition);
  z-index: 200;
}

.cart-overlay--open {
  opacity: 1;
  pointer-events: auto;
}

.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw);
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  transform: translateX(100%);
  transition: transform var(--transition);
  z-index: 201;
  display: flex;
  flex-direction: column;
}

.cart-drawer--open {
  transform: translateX(0);
}

.cart-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.cart-drawer__close {
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.cart-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm) var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.cart-items {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  list-style: none;
  padding: 0;
  margin: 0;
}

.cart-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.cart-item__info {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  min-width: 0;
}

.cart-item__title {
  font-weight: 600;
  font-size: var(--fs-small);
}

.cart-item__size,
.cart-item__price {
  font-size: var(--fs-small);
  color: var(--color-text-muted);
}

.cart-item__qty {
  display: flex;
  align-items: center;
  gap: 0.4em;
}

.cart-item__qty-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-text);
  cursor: pointer;
}

.cart-item__remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2em;
}

.cart-item__remove:hover,
.cart-item__remove:focus-visible {
  color: var(--color-danger);
}

.cart-total {
  font-family: var(--font-heading);
  font-size: var(--fs-h3);
  text-align: right;
}

.cart-checkout {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-sm);
}

.cart-checkout label {
  font-size: var(--fs-small);
  color: var(--color-text-muted);
}

.cart-checkout input,
.cart-checkout textarea {
  width: 100%;
  min-height: 44px;
  padding: 0.6em 0.9em;
  background: var(--color-bg-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--fs-body);
  font-family: var(--font-body);
}

.cart-checkout textarea {
  min-height: auto;
  resize: vertical;
}

.cart-checkout input:focus-visible,
.cart-checkout textarea:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.cart-delivery {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.cart-delivery legend {
  font-size: var(--fs-small);
  color: var(--color-text-muted);
  padding: 0;
}

.cart-delivery__option {
  display: flex;
  align-items: center;
  gap: 0.5em;
  font-size: var(--fs-body);
  color: var(--color-text);
}

.cart-np-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.cart-error {
  color: var(--color-danger);
  font-size: var(--fs-small);
}

.cart-confirm {
  text-align: center;
  padding: var(--space-lg) 0;
  font-size: var(--fs-body);
}
```

- [ ] **Step 3: Import the new stylesheet**

In `src/styles/main.css`, add the import (order doesn't matter much here, append at the end):

```css
@import './variables.css';
@import './base.css';
@import './header.css';
@import './hero.css';
@import './products.css';
@import './service.css';
@import './batteries.css';
@import './contacts.css';
@import './faq.css';
@import './footer.css';
@import './cart.css';
```

- [ ] **Step 4: Write `src/js/cart-ui.ts`**

```ts
// Бічна панель кошика: список позицій з кількістю, форма оформлення замовлення, підтвердження.
import {
  getItems,
  updateQty,
  removeItem,
  clear,
  getTotal,
  getCount,
  onChange,
  type CartItem,
} from './cart';
import { submitOrder, type OrderPayload } from './order-api';
import { showToast } from './telegram';

let drawerEl: HTMLElement;
let overlayEl: HTMLElement;
let bodyEl: HTMLElement;
let badgeEl: HTMLElement | null;
let confirmationMessage: string | null = null;

function formatPrice(price: number | null): string {
  return price !== null ? `${price.toLocaleString('uk-UA')} грн` : 'Ціна за запитом';
}

function buildDrawerMarkup(): string {
  return `
    <div class="cart-overlay" id="cart-overlay"></div>
    <aside class="cart-drawer" id="cart-drawer" aria-hidden="true" role="dialog" aria-label="Кошик">
      <div class="cart-drawer__head">
        <h2>Кошик</h2>
        <button type="button" class="cart-drawer__close" id="cart-close" aria-label="Закрити кошик">×</button>
      </div>
      <div class="cart-drawer__body" id="cart-body"></div>
    </aside>
  `;
}

function renderItemsList(container: HTMLElement, items: CartItem[]): void {
  if (items.length === 0) {
    container.innerHTML = '<p class="state-message">Кошик порожній</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'cart-items';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div class="cart-item__info">
        <span class="cart-item__title">${item.title}</span>
        <span class="cart-item__size">${item.sizeLine}</span>
        <span class="cart-item__price">${formatPrice(item.price)}</span>
      </div>
      <div class="cart-item__qty">
        <button type="button" class="cart-item__qty-btn" data-dec aria-label="Зменшити кількість">−</button>
        <span class="cart-item__qty-value">${item.qty}</span>
        <button type="button" class="cart-item__qty-btn" data-inc aria-label="Збільшити кількість">+</button>
      </div>
      <button type="button" class="cart-item__remove" data-remove aria-label="Видалити товар">×</button>
    `;

    li.querySelector('[data-dec]')?.addEventListener('click', () => updateQty(item.key, item.qty - 1));
    li.querySelector('[data-inc]')?.addEventListener('click', () => updateQty(item.key, item.qty + 1));
    li.querySelector('[data-remove]')?.addEventListener('click', () => removeItem(item.key));

    list.appendChild(li);
  });

  container.innerHTML = '';
  container.appendChild(list);

  const totalEl = document.createElement('div');
  totalEl.className = 'cart-total';
  totalEl.textContent = `Разом: ${getTotal().toLocaleString('uk-UA')} грн`;
  container.appendChild(totalEl);
}

function buildCheckoutForm(): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'cart-checkout';
  form.innerHTML = `
    <label for="cart-name">Ім'я</label>
    <input type="text" id="cart-name" name="name" required autocomplete="name" />

    <label for="cart-phone">Номер телефону</label>
    <input type="tel" id="cart-phone" name="phone" required autocomplete="tel" />

    <fieldset class="cart-delivery">
      <legend>Спосіб доставки</legend>
      <label class="cart-delivery__option">
        <input type="radio" name="delivery" value="pickup" checked /> Самовивіз з магазину
      </label>
      <label class="cart-delivery__option">
        <input type="radio" name="delivery" value="np" /> Нова Пошта
      </label>
    </fieldset>

    <div class="cart-np-fields" id="cart-np-fields" hidden>
      <label for="cart-np-city">Місто</label>
      <input type="text" id="cart-np-city" name="npCity" autocomplete="address-level2" />

      <label for="cart-np-branch">Відділення або адреса</label>
      <input type="text" id="cart-np-branch" name="npBranch" />
    </div>

    <label for="cart-comment">Коментар (необов'язково)</label>
    <textarea id="cart-comment" name="comment" rows="2"></textarea>

    <p class="cart-error" hidden></p>

    <button type="submit" class="btn btn--block">Оформити замовлення</button>
  `;

  const npFields = form.querySelector<HTMLElement>('#cart-np-fields')!;
  form.querySelectorAll<HTMLInputElement>('input[name="delivery"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      npFields.hidden = radio.value !== 'np';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = form.querySelector<HTMLElement>('.cart-error')!;
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const data = new FormData(form);
    const deliveryMethod = (String(data.get('delivery') ?? 'pickup') === 'np' ? 'np' : 'pickup') as 'pickup' | 'np';

    const payload: OrderPayload = {
      name: String(data.get('name') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      deliveryMethod,
      npCity: deliveryMethod === 'np' ? String(data.get('npCity') ?? '').trim() : undefined,
      npBranch: deliveryMethod === 'np' ? String(data.get('npBranch') ?? '').trim() : undefined,
      comment: String(data.get('comment') ?? '').trim() || undefined,
      items: getItems().map((i) => ({ title: i.title, sizeLine: i.sizeLine, price: i.price, qty: i.qty })),
      total: getTotal(),
    };

    if (!payload.name || !payload.phone) {
      errorEl.textContent = "Вкажіть ім'я та номер телефону";
      errorEl.hidden = false;
      return;
    }
    if (deliveryMethod === 'np' && (!payload.npCity || !payload.npBranch)) {
      errorEl.textContent = 'Вкажіть місто й відділення або адресу Нової Пошти';
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    submitBtn.disabled = true;
    const result = await submitOrder(payload);
    submitBtn.disabled = false;

    if (result.ok) {
      clear();
      confirmationMessage = 'Замовлення прийнято, ми з вами зв’яжемось';
      renderBody();
      showToast('Замовлення оформлено');
      window.setTimeout(() => {
        confirmationMessage = null;
        closeDrawer();
      }, 2500);
    } else {
      errorEl.textContent = result.error || 'Не вдалося оформити замовлення';
      errorEl.hidden = false;
    }
  });

  return form;
}

function renderBody(): void {
  bodyEl.innerHTML = '';

  if (confirmationMessage) {
    const confirm = document.createElement('p');
    confirm.className = 'cart-confirm';
    confirm.textContent = confirmationMessage;
    bodyEl.appendChild(confirm);
    return;
  }

  const itemsWrap = document.createElement('div');
  renderItemsList(itemsWrap, getItems());
  bodyEl.appendChild(itemsWrap);

  if (getItems().length > 0) {
    bodyEl.appendChild(buildCheckoutForm());
  }
}

function updateBadge(): void {
  if (!badgeEl) return;
  const count = getCount();
  badgeEl.textContent = String(count);
  badgeEl.hidden = count === 0;
}

function openDrawer(): void {
  drawerEl.classList.add('cart-drawer--open');
  overlayEl.classList.add('cart-overlay--open');
  drawerEl.setAttribute('aria-hidden', 'false');
}

function closeDrawer(): void {
  drawerEl.classList.remove('cart-drawer--open');
  overlayEl.classList.remove('cart-overlay--open');
  drawerEl.setAttribute('aria-hidden', 'true');
}

export function initCart(): void {
  document.body.insertAdjacentHTML('beforeend', buildDrawerMarkup());
  drawerEl = document.getElementById('cart-drawer')!;
  overlayEl = document.getElementById('cart-overlay')!;
  bodyEl = document.getElementById('cart-body')!;
  badgeEl = document.getElementById('cart-badge');

  document.getElementById('cart-toggle')?.addEventListener('click', openDrawer);
  document.getElementById('cart-close')?.addEventListener('click', closeDrawer);
  overlayEl.addEventListener('click', closeDrawer);

  onChange(() => {
    updateBadge();
    renderBody();
  });

  updateBadge();
  renderBody();
}
```

- [ ] **Step 5: Wire `initCart()` into the entry point**

In `src/main.ts`, add the import and call:

```ts
import './styles/main.css';
import { initNav } from './js/nav';
import { initHeroSlider } from './js/hero-slider';
import { initCatalogs, initCatalogTabs } from './js/render-products';
import { initServiceCta } from './js/render-service';
import { initMap } from './js/map';
import { initContent } from './js/content';
import { initCart } from './js/cart-ui';
```

and in the init calls at the bottom of the file:

```ts
initNav();
initCatalogTabs();
initHeroSlider();
initCatalogs();
initServiceCta();
initMap();
initFooterYear();
initFloatingCta();
initContent();
initCart();
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `npm run dev`, open the site:
1. Confirm the cart icon appears in the header with no visible badge (count is 0).
2. In devtools console: `const cart = await import('/src/js/cart.ts'); cart.addItem({ key: 'x', title: 'Тест шина', sizeLine: '205/55 R16', price: 1500 }, 2);`
3. Confirm the header badge now shows `2`.
4. Click the cart icon — drawer slides in from the right, shows the item with qty 2, a total of "3 000 грн", and a checkout form below.
5. Click `+`/`−` on the item — quantity and total update live; click the remove `×` — item disappears, form disappears, "Кошик порожній" shows.
6. Re-add the item, fill the form (leave delivery on "Самовивіз"), submit — button disables briefly, then either an error message appears (expected — Task 5's backend action doesn't exist yet) or a confirmation. Either way, no JS exception in the console.
7. Select "Нова Пошта" — city/branch fields appear; switch back to "Самовивіз" — they hide again.
8. Reload the page — badge count should still reflect whatever is left in the cart (persistence).

- [ ] **Step 8: Commit**

```bash
git add src/js/cart-ui.ts src/styles/cart.css src/styles/main.css index.html src/main.ts
git commit -m "$(cat <<'EOF'
Add cart drawer UI with checkout form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire "Купити" into product cards

**Files:**
- Modify: `src/js/render-products.ts`
- Modify: `src/styles/products.css`

**Interfaces:**
- Consumes: `addItem` from `src/js/cart.ts` (Task 1), `showToast` from `src/js/telegram.ts` (existing)
- Produces: nothing new consumed elsewhere — this is a leaf change

- [ ] **Step 1: Update imports in `src/js/render-products.ts`**

Replace:

```ts
import { buildTelegramLink, copyRequestText } from './telegram';
```

with:

```ts
import { showToast } from './telegram';
import { addItem } from './cart';
```

- [ ] **Step 2: Update the `CardInfo` interface**

Replace:

```ts
interface CardInfo {
  title: string;
  specs: { label: string; value: string }[];
  price: number | null;
  inStock: boolean;
  telegramMessage: string;
  /** undefined — картка без фото-блоку взагалі (шини); string|null — з фото-блоком (диски),
   *  null означає "фото поки немає" (показуємо плейсхолдер). */
  imageUrl?: string | null;
}
```

with:

```ts
interface CardInfo {
  title: string;
  specs: { label: string; value: string }[];
  price: number | null;
  inStock: boolean;
  /** Стабільний ідентифікатор товару для кошика — повторне "Купити" на той самий товар
   *  збільшує кількість замість дублювання позиції. */
  key: string;
  /** Короткий рядок розміру/характеристик для відображення в кошику. */
  sizeLine: string;
  /** undefined — картка без фото-блоку взагалі (шини); string|null — з фото-блоком (диски),
   *  null означає "фото поки немає" (показуємо плейсхолдер). */
  imageUrl?: string | null;
}
```

- [ ] **Step 3: Replace the buy link + copy button in `renderCard`**

Replace:

```ts
  const actions = document.createElement('div');
  actions.className = 'product-card__actions';

  const buyLink = document.createElement('a');
  buyLink.className = 'btn btn--small';
  buyLink.href = buildTelegramLink(info.telegramMessage);
  buyLink.target = '_blank';
  buyLink.rel = 'noopener';
  buyLink.textContent = 'Купити';
  actions.appendChild(buyLink);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'product-card__copy';
  copyBtn.setAttribute('aria-label', 'Скопіювати текст запиту для Telegram');
  copyBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" stroke="currentColor" stroke-width="1.6"/></svg>';
  copyBtn.addEventListener('click', () => copyRequestText(info.telegramMessage));
  actions.appendChild(copyBtn);

  footer.appendChild(actions);
```

with:

```ts
  const actions = document.createElement('div');
  actions.className = 'product-card__actions';

  const buyBtn = document.createElement('button');
  buyBtn.type = 'button';
  buyBtn.className = 'btn btn--small';
  buyBtn.textContent = 'Купити';
  buyBtn.addEventListener('click', () => {
    addItem({ key: info.key, title: info.title, sizeLine: info.sizeLine, price: info.price });
    showToast('Додано в кошик');
  });
  actions.appendChild(buyBtn);

  footer.appendChild(actions);
```

- [ ] **Step 4: Update `tiresDescribe`**

Replace:

```ts
function tiresDescribe(row: CsvRow): CardInfo {
  const price = parsePrice(row.price);
  const title = `${row.brand ?? ''} ${row.model ?? ''} ${row.width}/${row.profile} R${row.diameter}`.trim();
  const size = `${row.width}/${row.profile} R${row.diameter}`;
  return {
    title,
    specs: [
      { label: 'Сезон', value: row.season ?? '—' },
      { label: 'Шипи', value: parseBool(row.studded) ? 'Так' : 'Ні' },
      ...(row.load_index ? [{ label: 'Індекс навантаження', value: row.load_index }] : []),
      ...(row.speed_index ? [{ label: 'Індекс швидкості', value: row.speed_index }] : []),
    ],
    price,
    inStock: parseBool(row.in_stock),
    telegramMessage: `Вітаю, хочу купити товар «${title}»${price !== null ? ` (${size}, ${price} грн)` : ` (${size})`}`,
  };
}
```

with:

```ts
function tiresDescribe(row: CsvRow): CardInfo {
  const price = parsePrice(row.price);
  const title = `${row.brand ?? ''} ${row.model ?? ''} ${row.width}/${row.profile} R${row.diameter}`.trim();
  const size = `${row.width}/${row.profile} R${row.diameter}`;
  return {
    title,
    specs: [
      { label: 'Сезон', value: row.season ?? '—' },
      { label: 'Шипи', value: parseBool(row.studded) ? 'Так' : 'Ні' },
      ...(row.load_index ? [{ label: 'Індекс навантаження', value: row.load_index }] : []),
      ...(row.speed_index ? [{ label: 'Індекс швидкості', value: row.speed_index }] : []),
    ],
    price,
    inStock: parseBool(row.in_stock),
    key: `tires:${JSON.stringify(row)}`,
    sizeLine: size,
  };
}
```

- [ ] **Step 5: Update `wheelsDescribe`**

Replace:

```ts
function wheelsDescribe(row: CsvRow): CardInfo {
  const price = parsePrice(row.price);
  const title = `${row.brand ?? ''} ${row.model ?? ''} R${row.diameter} J${row.width}`.trim();
  const size = `R${row.diameter} J${row.width} PCD ${row.pcd} ET${row.et}`;
  return {
    title,
    specs: [
      { label: 'Тип', value: row.type ?? '—' },
      { label: 'PCD', value: row.pcd ?? '—' },
      { label: 'ET', value: row.et ?? '—' },
      { label: 'DIA', value: row.dia ?? '—' },
      ...(row.color ? [{ label: 'Колір', value: row.color }] : []),
    ],
    price,
    inStock: parseBool(row.in_stock),
    telegramMessage: `Вітаю, хочу купити товар «${title}»${price !== null ? ` (${size}, ${price} грн)` : ` (${size})`}`,
    imageUrl: row.image_url?.trim() || null,
  };
}
```

with:

```ts
function wheelsDescribe(row: CsvRow): CardInfo {
  const price = parsePrice(row.price);
  const title = `${row.brand ?? ''} ${row.model ?? ''} R${row.diameter} J${row.width}`.trim();
  const size = `R${row.diameter} J${row.width} PCD ${row.pcd} ET${row.et}`;
  return {
    title,
    specs: [
      { label: 'Тип', value: row.type ?? '—' },
      { label: 'PCD', value: row.pcd ?? '—' },
      { label: 'ET', value: row.et ?? '—' },
      { label: 'DIA', value: row.dia ?? '—' },
      ...(row.color ? [{ label: 'Колір', value: row.color }] : []),
    ],
    price,
    inStock: parseBool(row.in_stock),
    key: `wheels:${JSON.stringify(row)}`,
    sizeLine: size,
    imageUrl: row.image_url?.trim() || null,
  };
}
```

- [ ] **Step 6: Remove the now-unused copy-button styles from `src/styles/products.css`**

Delete this block (currently right after `.product-card__actions`):

```css
.product-card__copy {
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition), border-color var(--transition), background-color var(--transition);
}

.product-card__copy:hover,
.product-card__copy:focus-visible {
  color: var(--color-accent);
  border-color: var(--color-accent);
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors (no leftover references to `telegramMessage`, `buildTelegramLink`, or `copyRequestText` in this file).

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open the "Шини" tab:
1. Each product card shows exactly one button, "Купити" (no second icon button next to it).
2. Click "Купити" on a tire card — a toast "Додано в кошик" appears, and the header cart badge increments.
3. Click "Купити" on the same card again — badge goes to 2 (not 3 separate rows in the cart drawer).
4. Switch to "Диски" tab, click "Купити" on a wheel card — badge increments further, and opening the drawer shows both a tire and a wheel line.

- [ ] **Step 9: Commit**

```bash
git add src/js/render-products.ts src/styles/products.css
git commit -m "$(cat <<'EOF'
Wire product card buy button into the cart instead of Telegram

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Apps Script backend — orders sheet + actions

**Files:**
- Modify: `admin/apps-script/Code.gs`

**Interfaces:**
- Consumes: nothing from earlier tasks (separate runtime — Google Apps Script, not bundled by Vite)
- Produces: the `order` (public), `listOrders` (password), `updateOrderStatus` (password) `doPost` actions that Task 2's `submitOrder` and Task 6's admin orders tab call by name/shape

This file cannot be typechecked or unit tested — there is no local Apps Script runtime. Verification is a manual deploy against a real (or scratch) Google Sheet.

- [ ] **Step 1: Rewrite `admin/apps-script/Code.gs`**

```js
/**
 * Apps Script Web App для /admin сайту TIRE PLACE.
 *
 * Куди вставляти: Google Таблиця (та сама, де листи "Шини"/"Диски"/"Шиномонтаж") →
 * Розширення → Apps Script → вставити весь цей файл замість Code.gs.
 *
 * Одноразове налаштування:
 * 1. Створіть у таблиці лист з назвою "Контент" і заголовками в першому рядку: key, value.
 *    Лист "Замовлення" створюється автоматично при першому замовленні — вручну створювати не треба.
 * 2. Project Settings (⚙) → Script Properties → додати властивості:
 *    - ADMIN_PASSWORD — пароль для входу в /admin
 *    - BOT_TOKEN — токен Telegram-бота (від @BotFather)
 *    - CHAT_ID — chat_id, куди бот надсилає повідомлення про нові замовлення
 * 3. Deploy → New deployment → тип "Web app":
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    Скопіюйте URL, що закінчується на /exec.
 * 4. Впишіть цей URL у CONTENT_API_URL в src/config.ts сайту.
 *
 * Детальніше — README.md, розділи "Адмінка: редагування текстових блоків" і "Замовлення".
 */

var CONTENT_SHEET_NAME = 'Контент';
var ORDERS_SHEET_NAME = 'Замовлення';
var ORDER_HEADERS = [
  'order_id',
  'timestamp',
  'status',
  'name',
  'phone',
  'delivery_method',
  'np_city',
  'np_branch',
  'comment',
  'items',
  'total',
];

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var action = payload.action;

  if (action === 'verify') {
    return jsonResponse({ ok: checkPassword_(payload.password) });
  }

  if (action === 'save') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    if (!payload.key) {
      return jsonResponse({ ok: false, error: 'Не вказано ключ блоку' });
    }
    saveContentValue_(payload.key, payload.html || '');
    return jsonResponse({ ok: true });
  }

  if (action === 'order') {
    return jsonResponse(createOrder_(payload));
  }

  if (action === 'listOrders') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse({ ok: true, orders: listOrders_() });
  }

  if (action === 'updateOrderStatus') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(updateOrderStatus_(payload.orderId, payload.status));
  }

  return jsonResponse({ ok: false, error: 'Невідома дія' });
}

function checkPassword_(password) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return !!expected && password === expected;
}

function saveContentValue_(key, html) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONTENT_SHEET_NAME);
    sheet.appendRow(['key', 'value']);
  }

  var data = sheet.getDataRange().getValues();
  for (var row = 1; row < data.length; row++) {
    if (data[row][0] === key) {
      sheet.getRange(row + 1, 2).setValue(html);
      return;
    }
  }

  sheet.appendRow([key, html]);
}

function getOrCreateOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET_NAME);
    sheet.appendRow(ORDER_HEADERS);
  }
  return sheet;
}

function formatItemsText_(items) {
  if (!items || items.length === 0) return '—';
  return items
    .map(function (item, index) {
      var price = item.price === null || item.price === undefined ? null : Number(item.price);
      var qty = Number(item.qty) || 0;
      var priceText = price !== null ? price + ' грн' : 'ціна за запитом';
      var lineTotalText = price !== null ? price * qty + ' грн' : '—';
      return (
        (index + 1) + '. ' + item.title + ' (' + item.sizeLine + ') — ' + qty + ' шт. × ' + priceText + ' = ' + lineTotalText
      );
    })
    .join('\n');
}

function createOrder_(payload) {
  var sheet = getOrCreateOrdersSheet_();
  var orderId = 'ORD-' + new Date().getTime();
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var itemsText = formatItemsText_(payload.items);
  var total = Number(payload.total) || 0;
  var deliveryMethod = payload.deliveryMethod === 'np' ? 'Нова Пошта' : 'Самовивіз';

  sheet.appendRow([
    orderId,
    timestamp,
    'Нове',
    payload.name || '',
    payload.phone || '',
    deliveryMethod,
    payload.npCity || '',
    payload.npBranch || '',
    payload.comment || '',
    itemsText,
    total,
  ]);

  try {
    sendTelegramOrderNotification_(orderId, timestamp, payload, deliveryMethod, itemsText, total);
  } catch (err) {
    // Замовлення вже записане в таблицю — збій сповіщення в Telegram не повинен ламати відповідь користувачу.
    Logger.log('Telegram notification failed: ' + err);
  }

  return { ok: true, orderId: orderId };
}

function sendTelegramOrderNotification_(orderId, timestamp, payload, deliveryMethod, itemsText, total) {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var chatId = PropertiesService.getScriptProperties().getProperty('CHAT_ID');
  if (!token || !chatId) return;

  var deliveryLine =
    deliveryMethod === 'Нова Пошта'
      ? 'Нова Пошта, ' + (payload.npCity || '') + ', ' + (payload.npBranch || '')
      : 'Самовивіз з магазину';

  var lines = [
    '🛒 Нове замовлення ' + orderId,
    timestamp,
    "Ім'я: " + (payload.name || ''),
    'Телефон: ' + (payload.phone || ''),
    'Доставка: ' + deliveryLine,
  ];
  if (payload.comment) lines.push('Коментар: ' + payload.comment);
  lines.push('');
  lines.push(itemsText);
  lines.push('');
  lines.push('Разом: ' + total + ' грн');

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: lines.join('\n') }),
    muteHttpExceptions: true,
  });
}

function listOrders_() {
  var sheet = getOrCreateOrdersSheet_();
  var data = sheet.getDataRange().getValues();
  var orders = [];
  for (var row = 1; row < data.length; row++) {
    var r = data[row];
    if (!r[0]) continue;
    orders.push({
      orderId: r[0],
      timestamp: r[1],
      status: r[2],
      name: r[3],
      phone: r[4],
      deliveryMethod: r[5],
      npCity: r[6],
      npBranch: r[7],
      comment: r[8],
      items: r[9],
      total: r[10],
    });
  }
  return orders;
}

function updateOrderStatus_(orderId, status) {
  var sheet = getOrCreateOrdersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var row = 1; row < data.length; row++) {
    if (data[row][0] === orderId) {
      sheet.getRange(row + 1, 3).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Замовлення не знайдено' };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Manual deploy + verification (requires a real Google Sheet)**

1. Open the shop's Google Sheet → Extensions → Apps Script → replace `Code.gs` with the file above.
2. Script Properties: confirm `ADMIN_PASSWORD` exists; add `BOT_TOKEN` and `CHAT_ID` (see `README.md` steps from Task 7 — or use values already obtained while creating the bot earlier in this project).
3. Deploy → Manage deployments → edit the existing deployment → New version → Deploy. The `/exec` URL stays the same, no need to change `CONTENT_API_URL`.
4. From a terminal (replace `<URL>` with the deployed `/exec` URL):

```bash
curl -X POST '<URL>' -d '{"action":"order","name":"Тест","phone":"+380000000000","deliveryMethod":"pickup","items":[{"title":"Тестова шина","sizeLine":"205/55 R16","price":1500,"qty":2}],"total":3000}'
```

Expected: `{"ok":true,"orderId":"ORD-..."}`. Check that:
   - a "Замовлення" sheet now exists with a header row and one data row matching the request
   - the Telegram bot chat received a message with the order details

5. List orders:

```bash
curl -X POST '<URL>' -d '{"action":"listOrders","password":"<ADMIN_PASSWORD>"}'
```

Expected: `{"ok":true,"orders":[{...the row from step 4...}]}`.

6. Mark it processed:

```bash
curl -X POST '<URL>' -d '{"action":"updateOrderStatus","password":"<ADMIN_PASSWORD>","orderId":"ORD-...","status":"Опрацьовано"}'
```

Expected: `{"ok":true}`, and the sheet's `status` column for that row now reads "Опрацьовано".

- [ ] **Step 3: Commit**

```bash
git add admin/apps-script/Code.gs
git commit -m "$(cat <<'EOF'
Add order recording and Telegram notification to Apps Script backend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Admin tabs — "Замовлення" (default) + "Тексти"

**Files:**
- Create: `src/admin/api.ts`
- Create: `src/admin/content-tab.ts`
- Create: `src/admin/orders.ts`
- Rewrite: `src/admin/main.ts`
- Modify: `src/styles/admin.css`

**Interfaces:**
- Consumes: `CONTENT_API_URL` from `src/config.ts`; `CONTENT_REGISTRY`, `ContentBlock` from `src/admin/content-registry.ts` (existing, unchanged); Quill (existing dependency); Task 5's `order`/`listOrders`/`updateOrderStatus` actions
- Produces: `callApi`, `getSavedPassword`, `savePassword`, `clearPassword`, `showStatus` from `src/admin/api.ts`; `initContentTab(container, password)` from `src/admin/content-tab.ts`; `initOrdersTab(container, password)` from `src/admin/orders.ts` — all wired together by `src/admin/main.ts`, nothing consumed outside `/admin`

- [ ] **Step 1: Write `src/admin/api.ts`**

```ts
// Спільний HTTP-клієнт, сеансовий пароль і статус-тост для обох вкладок /admin
// ("Замовлення", "Тексти"). Читання даних (CSV) і так само йде через loadCsv, як на публічному
// сайті — цей модуль відповідає лише за запис/захищені дії через Apps Script Web App.
import { CONTENT_API_URL } from '../config';

const SESSION_KEY = 'admin_password';

export interface ApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// body без явного Content-Type лишається text/plain — так Apps Script Web App уникає CORS preflight.
export async function callApi(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult> {
  const response = await fetch(CONTENT_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function getSavedPassword(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function savePassword(password: string): void {
  sessionStorage.setItem(SESSION_KEY, password);
}

export function clearPassword(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

let statusEl: HTMLElement | null = null;
let statusTimer: number | undefined;

export function showStatus(message: string, isError = false): void {
  if (!statusEl) statusEl = document.getElementById('admin-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('admin-status--error', isError);
  statusEl.classList.add('admin-status--visible');
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => statusEl?.classList.remove('admin-status--visible'), 3000);
}
```

- [ ] **Step 2: Write `src/admin/content-tab.ts`**

```ts
// Вкладка "Тексти" адмінки: список текстових блоків з rich text editor (Quill).
// Читання поточних значень йде тим самим loadCsv, що й на публічному сайті; запис — через
// callApi('save', ...) з src/admin/api.ts.
import 'quill/dist/quill.snow.css';
import Quill from 'quill';
import { loadCsv } from '../js/sheets';
import { SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV } from '../config';
import { CONTENT_REGISTRY, type ContentBlock } from './content-registry';
import { callApi, showStatus } from './api';

function openEditor(
  item: HTMLElement,
  block: ContentBlock,
  currentHtml: string,
  password: string,
  onSaved: (newHtml: string) => void
): void {
  const head = item.querySelector('.admin-block__head') as HTMLElement;
  const editBtn = head.querySelector('[data-edit]') as HTMLButtonElement;
  const preview = item.querySelector('.admin-block__preview') as HTMLElement;
  editBtn.hidden = true;

  const editorWrap = document.createElement('div');
  editorWrap.className = 'admin-editor';
  const editorHost = document.createElement('div');
  editorWrap.appendChild(editorHost);

  const actions = document.createElement('div');
  actions.className = 'admin-editor__actions';
  actions.innerHTML = `
    <button class="btn btn--small" data-save>Зберегти</button>
    <button class="btn btn--outline btn--small" data-cancel>Скасувати</button>
  `;
  editorWrap.appendChild(actions);

  preview.replaceWith(editorWrap);

  const quill = new Quill(editorHost, {
    theme: 'snow',
    modules: {
      toolbar: [['bold', 'italic', 'underline'], ['link'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
    },
  });
  quill.root.innerHTML = currentHtml;

  function exitEditor(finalHtml: string): void {
    const newPreview = document.createElement('div');
    newPreview.className = 'admin-block__preview';
    newPreview.innerHTML = finalHtml;
    editorWrap.replaceWith(newPreview);
    editBtn.hidden = false;
  }

  actions.querySelector('[data-cancel]')?.addEventListener('click', () => exitEditor(currentHtml));

  actions.querySelector('[data-save]')?.addEventListener('click', async () => {
    const saveBtn = actions.querySelector('[data-save]') as HTMLButtonElement;
    saveBtn.disabled = true;
    const html = quill.root.innerHTML;

    try {
      const result = await callApi('save', { password, key: block.key, html });
      if (result.ok) {
        onSaved(html);
        exitEditor(html);
        showStatus('Збережено');
      } else {
        showStatus((result.error as string) || 'Не вдалося зберегти', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

export async function initContentTab(container: HTMLElement, password: string): Promise<void> {
  container.innerHTML = '<p class="state-message">Завантаження…</p>';

  const { rows } = await loadCsv(SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV);
  const values = new Map<string, string>();
  for (const row of rows) {
    if (row.key) values.set(row.key, row.value ?? '');
  }

  const groups = new Map<string, ContentBlock[]>();
  for (const block of CONTENT_REGISTRY) {
    const list = groups.get(block.group) ?? [];
    list.push(block);
    groups.set(block.group, list);
  }

  container.innerHTML = '';

  for (const [groupName, blocks] of groups) {
    const section = document.createElement('section');
    section.className = 'admin-group';
    section.innerHTML = `<h2>${groupName}</h2>`;

    for (const block of blocks) {
      const currentHtml = values.get(block.key) || block.defaultHtml;
      const item = document.createElement('article');
      item.className = 'admin-block';
      item.innerHTML = `
        <div class="admin-block__head">
          <span class="admin-block__label">${block.label}</span>
          <button class="btn btn--outline btn--small" data-edit>Редагувати</button>
        </div>
        <div class="admin-block__preview">${currentHtml}</div>
      `;
      section.appendChild(item);

      const editBtn = item.querySelector('[data-edit]') as HTMLButtonElement;
      editBtn.addEventListener('click', () =>
        openEditor(item, block, values.get(block.key) || block.defaultHtml, password, (newHtml) => {
          values.set(block.key, newHtml);
        })
      );
    }

    container.appendChild(section);
  }
}
```

- [ ] **Step 3: Write `src/admin/orders.ts`**

```ts
// Вкладка "Замовлення" адмінки: список усіх замовлень (найновіші зверху), кнопка "Опрацьовано".
import { callApi, showStatus } from './api';

interface Order {
  orderId: string;
  timestamp: string;
  status: string;
  name: string;
  phone: string;
  deliveryMethod: string;
  npCity: string;
  npBranch: string;
  comment: string;
  items: string;
  total: string | number;
}

function renderOrderCard(order: Order, password: string, onProcessed: () => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'admin-order';

  const deliveryLine =
    order.deliveryMethod === 'Нова Пошта'
      ? `Нова Пошта — ${order.npCity || ''}, ${order.npBranch || ''}`
      : 'Самовивіз з магазину';

  const isDone = order.status === 'Опрацьовано';

  card.innerHTML = `
    <div class="admin-order__head">
      <span class="admin-order__id">${order.orderId}</span>
      <span class="admin-order__status admin-order__status--${isDone ? 'done' : 'new'}">${order.status}</span>
    </div>
    <div class="admin-order__time">${order.timestamp}</div>
    <div class="admin-order__row"><strong>${order.name}</strong> · ${order.phone}</div>
    <div class="admin-order__row">${deliveryLine}</div>
    ${order.comment ? `<div class="admin-order__row admin-order__comment">${order.comment}</div>` : ''}
    <pre class="admin-order__items">${order.items}</pre>
    <div class="admin-order__total">Разом: ${order.total} грн</div>
  `;

  if (!isDone) {
    const processBtn = document.createElement('button');
    processBtn.type = 'button';
    processBtn.className = 'btn btn--small';
    processBtn.textContent = 'Опрацьовано';
    processBtn.addEventListener('click', async () => {
      processBtn.disabled = true;
      try {
        const result = await callApi('updateOrderStatus', {
          password,
          orderId: order.orderId,
          status: 'Опрацьовано',
        });
        if (result.ok) {
          onProcessed();
        } else {
          showStatus((result.error as string) || 'Не вдалося оновити статус', true);
          processBtn.disabled = false;
        }
      } catch {
        showStatus('Не вдалося з’єднатися з сервером адмінки', true);
        processBtn.disabled = false;
      }
    });
    card.appendChild(processBtn);
  }

  return card;
}

export async function initOrdersTab(container: HTMLElement, password: string): Promise<void> {
  container.innerHTML = '<p class="state-message">Завантаження…</p>';

  try {
    const result = await callApi('listOrders', { password });

    if (!result.ok) {
      container.innerHTML = '';
      const msg = document.createElement('p');
      msg.className = 'state-message state-message--error';
      msg.textContent = (result.error as string) || 'Не вдалося завантажити замовлення';
      container.appendChild(msg);
      return;
    }

    const orders = (result.orders as Order[]) ?? [];
    container.innerHTML = '';

    if (orders.length === 0) {
      container.innerHTML = '<p class="state-message">Замовлень поки немає</p>';
      return;
    }

    const sorted = [...orders].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    sorted.forEach((order) => {
      container.appendChild(renderOrderCard(order, password, () => initOrdersTab(container, password)));
    });
  } catch {
    container.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'state-message state-message--error';
    msg.textContent = 'Не вдалося з’єднатися з сервером адмінки';
    container.appendChild(msg);
  }
}
```

- [ ] **Step 4: Rewrite `src/admin/main.ts`**

```ts
// Точка входу /admin: пароль-гейт + перемикач вкладок "Замовлення" (за замовчуванням) / "Тексти".
import '../styles/admin.css';
import { CONTENT_API_URL } from '../config';
import { callApi, getSavedPassword, savePassword, clearPassword, showStatus } from './api';
import { initOrdersTab } from './orders';
import { initContentTab } from './content-tab';

const mainEl = document.getElementById('admin-main');

function renderNotConfigured(): void {
  if (!mainEl) return;
  mainEl.innerHTML = `
    <div class="admin-card admin-card--center">
      <h1>Адмінку ще не налаштовано</h1>
      <p>
        Задеплойте Google Apps Script (<code>admin/apps-script/Code.gs</code>) як Web App і впишіть
        його URL у <code>CONTENT_API_URL</code> в <code>src/config.ts</code> — детальні кроки в
        <code>README.md</code>.
      </p>
    </div>
  `;
}

function renderLogin(onSuccess: (password: string) => void): void {
  if (!mainEl) return;
  mainEl.innerHTML = `
    <form class="admin-card admin-login" id="admin-login-form">
      <h1>Вхід в адмінку</h1>
      <label for="admin-password">Пароль</label>
      <input type="password" id="admin-password" name="password" required autocomplete="current-password" />
      <button type="submit" class="btn btn--block">Увійти</button>
    </form>
  `;

  const form = document.getElementById('admin-login-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('admin-password') as HTMLInputElement | null;
    const password = input?.value ?? '';
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await callApi('verify', { password });
      if (result.ok) {
        savePassword(password);
        onSuccess(password);
      } else {
        showStatus('Неправильний пароль', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function renderTabsShell(password: string): void {
  if (!mainEl) return;
  mainEl.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-tabs" role="tablist">
        <button class="admin-tabs__btn" data-tab="orders" role="tab" type="button">Замовлення</button>
        <button class="admin-tabs__btn" data-tab="content" role="tab" type="button">Тексти</button>
      </div>
      <button class="btn btn--outline btn--small" id="admin-logout" type="button">Вийти</button>
    </div>
    <div id="admin-tab-content"></div>
  `;

  document.getElementById('admin-logout')?.addEventListener('click', () => {
    clearPassword();
    location.reload();
  });

  const tabButtons = Array.from(mainEl.querySelectorAll<HTMLButtonElement>('.admin-tabs__btn'));
  const tabContentEl = document.getElementById('admin-tab-content') as HTMLElement;

  function activate(tab: string): void {
    tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tab));
    if (tab === 'content') {
      initContentTab(tabContentEl, password);
    } else {
      initOrdersTab(tabContentEl, password);
    }
  }

  tabButtons.forEach((btn) => btn.addEventListener('click', () => activate(btn.dataset.tab ?? 'orders')));

  activate('orders');
}

function init(): void {
  if (!CONTENT_API_URL) {
    renderNotConfigured();
    return;
  }

  const savedPassword = getSavedPassword();
  if (savedPassword) {
    renderTabsShell(savedPassword);
  } else {
    renderLogin((password) => renderTabsShell(password));
  }
}

init();
```

- [ ] **Step 5: Add tab-switcher and order-card styles to `src/styles/admin.css`**

Append at the end of the file:

```css
.admin-tabs {
  display: flex;
  gap: var(--space-xs);
}

.admin-tabs__btn {
  padding: 0.5em 1em;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--fs-small);
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background-color var(--transition);
}

.admin-tabs__btn.is-active {
  color: var(--color-text);
  border-color: var(--color-accent);
  background: var(--color-bg-raised);
}

.admin-order {
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.admin-order__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.admin-order__id {
  font-weight: 600;
  font-size: var(--fs-small);
  color: var(--color-text-muted);
}

.admin-order__status {
  font-size: var(--fs-small);
  padding: 0.2em 0.6em;
  border-radius: var(--radius-pill);
}

.admin-order__status--new {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.admin-order__status--done {
  background: var(--color-success);
  color: var(--color-accent-contrast);
}

.admin-order__time {
  font-size: var(--fs-small);
  color: var(--color-text-muted);
  margin-bottom: var(--space-xs);
}

.admin-order__row {
  font-size: var(--fs-small);
  margin-bottom: 0.3em;
}

.admin-order__items {
  font-family: var(--font-body);
  font-size: var(--fs-small);
  white-space: pre-wrap;
  background: var(--color-bg-alt);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
  margin: var(--space-xs) 0;
}

.admin-order__total {
  font-weight: 700;
  margin-bottom: var(--space-xs);
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors (no leftover imports of the old single-file `main.ts` logic; `content-registry.ts` import path unchanged).

- [ ] **Step 7: Manual verification**

Requires `CONTENT_API_URL` in `src/config.ts` to point at the deployment from Task 5 (or temporarily paste in a test deployment URL for this check, then revert if it's a scratch one).

Run `npm run dev`, open `/admin/`:
1. Log in with the admin password — the "Замовлення" tab is active by default and shows the order(s) created during Task 5's `curl` testing (or "Замовлень поки немає" if none exist).
2. Click "Тексти" — the existing text-block editor list still works exactly as before (edit, save, cancel).
3. Click back to "Замовлення" — still shows the same list.
4. On an order with status "Нове", click "Опрацьовано" — button disables, then the card re-renders with status "Опрацьовано" and no button. Refresh the page and confirm the status persisted (re-fetches from the sheet).
5. Click "Вийти" — returns to the login form; logging back in returns straight to "Замовлення" tab.

- [ ] **Step 8: Commit**

```bash
git add src/admin/api.ts src/admin/content-tab.ts src/admin/orders.ts src/admin/main.ts src/styles/admin.css
git commit -m "$(cat <<'EOF'
Split /admin into tabs: Замовлення (default) and Тексти

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (docs only)
- Produces: nothing consumed by code — this is the terminal task

- [ ] **Step 1: Add an "Замовлення" section to `README.md`**

Insert a new section right after the existing "Адмінка: редагування текстових блоків (`/admin`)" section (after its closing paragraph, before "## Як додати товар чи послугу"):

```markdown
## Кошик і замовлення

Кнопка "Купити" на картці товару (шини/диски) додає товар у кошик (бічна панель, іконка в
хедері) замість прямого переходу в Telegram. У кошику покупець редагує кількість, заповнює форму
(ім'я, телефон, спосіб доставки — самовивіз або Нова Пошта з містом і відділенням/адресою,
необов'язковий коментар) і тисне "Оформити замовлення".

Замовлення записується в лист **"Замовлення"** тієї ж Google Таблиці (створюється автоматично при
першому замовленні) і одночасно дублюється повідомленням від Telegram-бота власнику — той самий
Apps Script Web App, що вже обслуговує `/admin` (`CONTENT_API_URL` в `src/config.ts`), обробляє
запис і відправку. Якщо Telegram-повідомлення з якоїсь причини не надійшло — замовлення однаково
є в таблиці й видно в `/admin` → вкладка "Замовлення" (перша й активна за замовчуванням після
входу), де є кнопка "Опрацьовано" для позначення виконаних замовлень.

### Одноразове налаштування бота

1. У Telegram напишіть **@BotFather** → `/newbot`, дайте боту ім'я й унікальний username, що
   закінчується на `bot`. BotFather надішле **BOT_TOKEN** (`123456789:AA...`).
2. Знайдіть бота за його username і напишіть йому будь-яке повідомлення (бот не може написати
   першим).
3. Відкрийте в браузері `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` — у відповіді
   знайдіть `"chat":{"id": ЧИСЛО}` — це **CHAT_ID**.
4. Project Settings → Script Properties у тому ж Apps Script, що й `ADMIN_PASSWORD` — додайте
   `BOT_TOKEN` і `CHAT_ID`.
5. Deploy → Manage deployments → New version (URL лишається той самий, `CONTENT_API_URL` міняти
   не потрібно).

**Порада з безпеки:** токен бота дає повний контроль над ботом — не публікуйте його й не діліться
скріншотами з ним; якщо токен випадково "засвітився", перегенеруйте його через
`@BotFather → /mybots → обрати бота → API Token → Revoke current token`.
```

- [ ] **Step 2: Add a note to `CLAUDE.md`'s architecture section**

In the "Architecture" section of `CLAUDE.md`, after the bullet describing `render-service.ts` and before "**Other modules:**", insert:

```markdown
- **Cart & checkout:** `src/js/cart.ts` holds cart state (`localStorage`-backed, one cart shared
  across tires/wheels) with `addItem`/`updateQty`/`removeItem`/`onChange` subscription.
  `src/js/cart-ui.ts` renders the header cart icon/badge and the slide-out drawer with the
  checkout form (name, phone, delivery method — pickup or Nova Poshta with city/branch —
  optional comment). `render-products.ts`'s "Купити" button calls `cart.addItem()` (no longer a
  direct Telegram link). Checkout POSTs through `src/js/order-api.ts` to the same Apps Script Web
  App as `/admin` (`CONTENT_API_URL`), which appends a row to a "Замовлення" sheet and relays the
  order to a Telegram bot chat — see `README.md`, "Кошик і замовлення", for the bot setup steps
  and the sheet's exact column contract.
```

- [ ] **Step 3: Verify prose reads correctly**

Read both edited sections back and confirm no broken markdown (heading levels, closed code fences) and no leftover references to the removed copy-to-clipboard button.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Document cart/checkout flow and Telegram bot setup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
