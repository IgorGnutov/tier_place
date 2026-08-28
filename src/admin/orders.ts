// Вкладка "Замовлення" адмінки: список усіх замовлень (найновіші зверху),
// кнопки "Опрацьовано" та "Видалити" (видалення приховує замовлення лише в адмінці,
// рядок у Google Таблиці не чіпається — див. Code.gs hideOrder_). Кнопка "Архів" перемикає
// список на приховані замовлення, звідки їх можна повернути кнопкою "Відновити".
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

type Mode = 'active' | 'archive';

// Дані замовлення приходять з публічної (без пароля) дії 'order', тому будь-який відвідувач може
// підсунути HTML — усе, що потрапляє в innerHTML, обов'язково екрануємо.
function escapeHtml(value: unknown): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

// Порівнюємо тільки цифри, щоб формат номера (+38 067 ..., пробіли, дефіси) не заважав пошуку.
function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

// order.timestamp приходить як ISO-рядок в UTC (напр. "2026-08-27T16:50:17.000Z") —
// показуємо його за київським часом у зрозумілому форматі.
function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderOrderCard(order: Order, password: string, mode: Mode, onChanged: () => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'admin-order';

  const deliveryLine =
    order.deliveryMethod === 'Нова Пошта'
      ? `Нова Пошта — ${order.npCity || ''}, ${order.npBranch || ''}`
      : 'Самовивіз з магазину';

  const isDone = order.status === 'Опрацьовано';

  card.innerHTML = `
    <div class="admin-order__head">
      <span class="admin-order__id">${escapeHtml(order.orderId)}</span>
      <span class="admin-order__status admin-order__status--${isDone ? 'done' : 'new'}">${escapeHtml(order.status)}</span>
    </div>
    <div class="admin-order__time">${escapeHtml(formatTimestamp(order.timestamp))}</div>
    <div class="admin-order__row"><strong>${escapeHtml(order.name)}</strong> · ${escapeHtml(order.phone)}</div>
    <div class="admin-order__row">${escapeHtml(deliveryLine)}</div>
    ${order.comment ? `<div class="admin-order__row admin-order__comment">${escapeHtml(order.comment)}</div>` : ''}
    <pre class="admin-order__items">${escapeHtml(order.items)}</pre>
    <div class="admin-order__total">Разом: ${escapeHtml(order.total)} грн</div>
  `;

  const actions = document.createElement('div');
  actions.className = 'admin-order__actions';

  if (mode === 'archive') {
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn btn--small btn--outline';
    restoreBtn.textContent = 'Відновити';
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      try {
        const result = await callApi('restoreOrder', { password, orderId: order.orderId });
        if (result.ok) {
          onChanged();
        } else {
          showStatus((result.error as string) || 'Не вдалося відновити замовлення', true);
          restoreBtn.disabled = false;
        }
      } catch {
        showStatus('Не вдалося з’єднатися з сервером адмінки', true);
        restoreBtn.disabled = false;
      }
    });
    actions.appendChild(restoreBtn);
    card.appendChild(actions);
    return card;
  }

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
          onChanged();
        } else {
          showStatus((result.error as string) || 'Не вдалося оновити статус', true);
          processBtn.disabled = false;
        }
      } catch {
        showStatus('Не вдалося з’єднатися з сервером адмінки', true);
        processBtn.disabled = false;
      }
    });
    actions.appendChild(processBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn--small btn--outline btn--danger';
  deleteBtn.textContent = 'Видалити';
  deleteBtn.addEventListener('click', async () => {
    if (!window.confirm(`Видалити замовлення ${order.orderId} зі списку?\n(У таблиці Google Sheets рядок залишиться)`)) {
      return;
    }
    deleteBtn.disabled = true;
    try {
      // Приховуємо замовлення тільки в адмінці — рядок у Google Таблиці не видаляється.
      const result = await callApi('hideOrder', { password, orderId: order.orderId });
      if (result.ok) {
        onChanged();
      } else {
        showStatus((result.error as string) || 'Не вдалося видалити замовлення', true);
        deleteBtn.disabled = false;
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
      deleteBtn.disabled = false;
    }
  });
  actions.appendChild(deleteBtn);

  card.appendChild(actions);

  return card;
}

async function renderOrders(container: HTMLElement, password: string, mode: Mode, filterQuery = ''): Promise<void> {
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-orders-toolbar';

  const filterInput = document.createElement('input');
  filterInput.type = 'tel';
  filterInput.className = 'admin-orders-toolbar__filter';
  filterInput.placeholder = 'Пошук за номером телефону';
  filterInput.value = filterQuery;
  toolbar.appendChild(filterInput);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn--outline btn--small';
  toggleBtn.textContent = mode === 'active' ? 'Архів' : '← Замовлення';
  toggleBtn.addEventListener('click', () =>
    renderOrders(container, password, mode === 'active' ? 'archive' : 'active', filterInput.value),
  );
  toolbar.appendChild(toggleBtn);
  container.appendChild(toolbar);

  const listEl = document.createElement('div');
  listEl.innerHTML = '<p class="state-message">Завантаження…</p>';
  container.appendChild(listEl);

  try {
    const result = await callApi(mode === 'active' ? 'listOrders' : 'listArchivedOrders', { password });

    if (!result.ok) {
      listEl.innerHTML = '';
      const msg = document.createElement('p');
      msg.className = 'state-message state-message--error';
      msg.textContent = (result.error as string) || 'Не вдалося завантажити замовлення';
      listEl.appendChild(msg);
      return;
    }

    const orders = (result.orders as Order[]) ?? [];

    if (orders.length === 0) {
      listEl.innerHTML = `<p class="state-message">${mode === 'active' ? 'Замовлень поки немає' : 'Архів порожній'}</p>`;
      return;
    }

    const sorted = [...orders].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const onChanged = () => renderOrders(container, password, mode, filterInput.value);

    const applyFilter = () => {
      const query = normalizePhone(filterInput.value);
      const filtered = query ? sorted.filter((order) => normalizePhone(order.phone).includes(query)) : sorted;

      listEl.innerHTML = '';
      if (filtered.length === 0) {
        listEl.innerHTML = `<p class="state-message">${query ? 'Нічого не знайдено' : mode === 'active' ? 'Замовлень поки немає' : 'Архів порожній'}</p>`;
        return;
      }
      filtered.forEach((order) => {
        listEl.appendChild(renderOrderCard(order, password, mode, onChanged));
      });
    };

    filterInput.addEventListener('input', applyFilter);
    applyFilter();
  } catch {
    listEl.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'state-message state-message--error';
    msg.textContent = 'Не вдалося з’єднатися з сервером адмінки';
    listEl.appendChild(msg);
  }
}

export async function initOrdersTab(container: HTMLElement, password: string): Promise<void> {
  return renderOrders(container, password, 'active');
}
