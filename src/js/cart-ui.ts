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

const DRAFT_STORAGE_KEY = 'tire_place_cart_draft_v1';

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

/** Форматує ввід у маску "+38 XXX XXX XX XX", ігноруючи все, крім цифр після коду 38. */
function formatPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('38')) digits = digits.slice(2);
  digits = digits.slice(0, 10);
  if (!digits) return '';

  let result = '+38 ' + digits.slice(0, 3);
  if (digits.length > 3) result += ' ' + digits.slice(3, 6);
  if (digits.length > 6) result += ' ' + digits.slice(6, 8);
  if (digits.length > 8) result += ' ' + digits.slice(8, 10);
  return result;
}

function attachPhoneMask(input: HTMLInputElement): void {
  input.addEventListener('focus', () => {
    if (!input.value) input.value = '+38 ';
  });
  input.addEventListener('input', () => {
    input.value = formatPhoneMask(input.value);
  });
}

function buildCheckoutForm(): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'cart-checkout';
  form.innerHTML = `
    <label for="cart-name">Ім'я</label>
    <input type="text" id="cart-name" name="name" required autocomplete="name" />

    <label for="cart-phone">Номер телефону</label>
    <input type="tel" id="cart-phone" name="phone" required autocomplete="tel" inputmode="numeric" placeholder="+38 ___ ___ __ __" maxlength="17" />

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

  attachPhoneMask(form.querySelector<HTMLInputElement>('#cart-phone')!);

  const npFields = form.querySelector<HTMLElement>('#cart-np-fields')!;
  form.querySelectorAll<HTMLInputElement>('input[name="delivery"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      npFields.hidden = radio.value !== 'np';
    });
  });

  // Зберігаємо введені дані на кожну зміну, щоб вони не губились при перезавантаженні сторінки.
  form.addEventListener('input', () => persistDraft(readFormDraft(form)));
  form.addEventListener('change', () => persistDraft(readFormDraft(form)));

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
      clearDraftStorage();
      confirmationMessage = 'Замовлення прийнято, ми з вами зв’яжемось';
      renderBody();
      showToast('Замовлення оформлено');
      window.setTimeout(() => {
        confirmationMessage = null;
        // Перемальовуємо одразу: інакше при повторному відкритті кошика без змін у ньому
        // покупець побачить застаріле "Замовлення прийнято" замість "Кошик порожній".
        renderBody();
        closeDrawer();
      }, 2500);
    } else {
      errorEl.textContent = result.error || 'Не вдалося оформити замовлення';
      errorEl.hidden = false;
    }
  });

  return form;
}

interface CheckoutDraft {
  name: string;
  phone: string;
  delivery: string;
  npCity: string;
  npBranch: string;
  comment: string;
}

function readFormDraft(form: HTMLFormElement): CheckoutDraft {
  const valueOf = (selector: string): string =>
    form.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value ?? '';

  return {
    name: valueOf('#cart-name'),
    phone: valueOf('#cart-phone'),
    delivery: form.querySelector<HTMLInputElement>('input[name="delivery"]:checked')?.value ?? 'pickup',
    npCity: valueOf('#cart-np-city'),
    npBranch: valueOf('#cart-np-branch'),
    comment: valueOf('#cart-comment'),
  };
}

/** Знімок уже введених у форму даних — щоб зміна кількості в кошику не стирала набране. */
function captureCheckoutDraft(): CheckoutDraft | null {
  const form = bodyEl.querySelector<HTMLFormElement>('.cart-checkout');
  if (!form) return null;
  return readFormDraft(form);
}

function loadDraftFromStorage(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutDraft;
  } catch {
    return null;
  }
}

function persistDraft(draft: CheckoutDraft): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // localStorage може бути недоступний (приватний режим, квота) — чернетка просто не переживе перезавантаження.
  }
}

function clearDraftStorage(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ігноруємо — те саме обмеження, що і в persistDraft
  }
}

function restoreCheckoutDraft(form: HTMLFormElement, draft: CheckoutDraft): void {
  const setValue = (selector: string, value: string): void => {
    const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (field) field.value = value;
  };

  setValue('#cart-name', draft.name);
  setValue('#cart-phone', draft.phone);
  setValue('#cart-np-city', draft.npCity);
  setValue('#cart-np-branch', draft.npBranch);
  setValue('#cart-comment', draft.comment);

  const radio = form.querySelector<HTMLInputElement>(`input[name="delivery"][value="${draft.delivery}"]`);
  if (radio) {
    radio.checked = true;
    // Не дублюємо логіку показу полів Нової Пошти — вмикаємо той самий обробник 'change'.
    radio.dispatchEvent(new Event('change'));
  }
}

function renderBody(): void {
  // Помилку відправки навмисно не зберігаємо: вона стосувалась попереднього складу кошика.
  // Якщо форми ще нема в DOM (перший рендер після перезавантаження сторінки) — беремо чернетку зі сховища.
  const draft = captureCheckoutDraft() ?? loadDraftFromStorage();
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
    const form = buildCheckoutForm();
    bodyEl.appendChild(form);
    if (draft) restoreCheckoutDraft(form, draft);
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
  drawerEl.inert = false;
}

function closeDrawer(): void {
  drawerEl.classList.remove('cart-drawer--open');
  overlayEl.classList.remove('cart-overlay--open');
  drawerEl.setAttribute('aria-hidden', 'true');
  // inert: закрита панель зсунута за екран, її поля не мають лишатись у tab-порядку.
  drawerEl.inert = true;
}

export function initCart(): void {
  document.body.insertAdjacentHTML('beforeend', buildDrawerMarkup());
  drawerEl = document.getElementById('cart-drawer')!;
  overlayEl = document.getElementById('cart-overlay')!;
  bodyEl = document.getElementById('cart-body')!;
  badgeEl = document.getElementById('cart-badge');
  drawerEl.inert = true;

  document.getElementById('cart-toggle')?.addEventListener('click', openDrawer);
  document.getElementById('cart-close')?.addEventListener('click', closeDrawer);
  overlayEl.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerEl.classList.contains('cart-drawer--open')) {
      closeDrawer();
    }
  });

  onChange(() => {
    updateBadge();
    renderBody();
  });

  updateBadge();
  renderBody();
}
