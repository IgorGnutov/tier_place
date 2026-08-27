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
