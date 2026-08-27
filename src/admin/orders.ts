// Вкладка "Замовлення" адмінки: список усіх замовлень (найновіші зверху),
// кнопки "Опрацьовано" та "Видалити" (видалення приховує замовлення лише в адмінці,
// рядок у Google Таблиці не чіпається — див. Code.gs hideOrder_).
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

// Дані замовлення приходять з публічної (без пароля) дії 'order', тому будь-який відвідувач може
// підсунути HTML — усе, що потрапляє в innerHTML, обов'язково екрануємо.
function escapeHtml(value: unknown): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
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

function renderOrderCard(order: Order, password: string, onChanged: () => void): HTMLElement {
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
