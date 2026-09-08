// Вкладка "Відгуки" адмінки: черга модерації. Нічого не потрапляє на сайт, доки власник не
// натисне "Опублікувати" — див. Code.gs moderateReview_ (рядок у таблиці не видаляється, лише
// змінюється статус).
import { callApi, showStatus } from './api';

interface Review {
  reviewId: string;
  timestamp: string;
  status: string;
  productId: string;
  productTitle: string;
  productUrl: string;
  author: string;
  rating: string | number;
  body: string;
}

const STATUS_NEW = 'Нове';
const STATUS_PUBLISHED = 'Опубліковано';
const STATUS_REJECTED = 'Відхилено';

// Схвалення відгуку саме по собі нічого не змінює на сайті — сторінки товару статичні й
// перебудовуються білдом. Затримка збирає пачку модерацій в один запуск: у deploy.yml стоїть
// concurrency.cancel-in-progress, тож серія швидких тригерів скасовувала б попередній забіг,
// потенційно на середині FTP-заливки.
const REBUILD_DELAY_MS = 15_000;
let rebuildTimer: number | undefined;

function scheduleRebuild(password: string): void {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(async () => {
    try {
      const result = await callApi('rebuildProducts', { password });
      if (result.ok) {
        showStatus('Оновлення сайту запущено — відгуки з’являться протягом кількох хвилин');
      } else {
        showStatus((result.error as string) || 'Не вдалося запустити оновлення сайту', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    }
  }, REBUILD_DELAY_MS);
}

// Дані відгуку приходять з публічної (без пароля) дії 'review', тому будь-який відвідувач може
// підсунути HTML — усе, що потрапляє в innerHTML, обов'язково екрануємо.
function escapeHtml(value: unknown): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function starsText(rating: string | number): string {
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) return String(rating ?? '');
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

function statusModifier(status: string): string {
  if (status === STATUS_PUBLISHED) return 'published';
  if (status === STATUS_REJECTED) return 'rejected';
  return 'new';
}

function renderReviewCard(review: Review, password: string, onChanged: () => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'admin-order admin-review';

  const productHtml = review.productUrl
    ? `<a href="${escapeHtml(review.productUrl)}" target="_blank" rel="noopener">${escapeHtml(review.productTitle || review.productId)}</a>`
    : escapeHtml(review.productTitle || review.productId);

  card.innerHTML = `
    <div class="admin-order__head">
      <span class="admin-order__id">${escapeHtml(review.reviewId)}</span>
      <span class="admin-order__status admin-order__status--${statusModifier(review.status)}">${escapeHtml(review.status)}</span>
    </div>
    <div class="admin-order__time">${escapeHtml(review.timestamp)}</div>
    <div class="admin-order__row">Товар: ${productHtml}</div>
    <div class="admin-order__row">
      <strong>${escapeHtml(review.author)}</strong>
      <span class="admin-review__stars">${starsText(review.rating)}</span>
    </div>
    <p class="admin-review__body">${escapeHtml(review.body)}</p>
  `;

  const actions = document.createElement('div');
  actions.className = 'admin-order__actions';

  const moderate = (status: string, button: HTMLButtonElement): void => {
    button.disabled = true;
    void (async () => {
      try {
        const result = await callApi('moderateReview', { password, reviewId: review.reviewId, status });
        if (result.ok) {
          // Перебудова потрібна лише якщо змінюється те, що видно на сайті: публікація або
          // зняття вже опублікованого. Відхилення відгуку зі статусом "Нове" сайт не змінює.
          if (status === STATUS_PUBLISHED || review.status === STATUS_PUBLISHED) {
            scheduleRebuild(password);
          }
          onChanged();
        } else {
          showStatus((result.error as string) || 'Не вдалося оновити відгук', true);
          button.disabled = false;
        }
      } catch {
        showStatus('Не вдалося з’єднатися з сервером адмінки', true);
        button.disabled = false;
      }
    })();
  };

  if (review.status !== STATUS_PUBLISHED) {
    const publishBtn = document.createElement('button');
    publishBtn.type = 'button';
    publishBtn.className = 'btn btn--small';
    publishBtn.textContent = 'Опублікувати';
    publishBtn.addEventListener('click', () => moderate(STATUS_PUBLISHED, publishBtn));
    actions.appendChild(publishBtn);
  }

  if (review.status !== STATUS_REJECTED) {
    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'btn btn--small btn--outline btn--danger';
    rejectBtn.textContent = 'Відхилити';
    rejectBtn.addEventListener('click', () => moderate(STATUS_REJECTED, rejectBtn));
    actions.appendChild(rejectBtn);
  }

  card.appendChild(actions);
  return card;
}

async function renderReviews(container: HTMLElement, password: string, statusFilter = STATUS_NEW): Promise<void> {
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-orders-toolbar';

  const select = document.createElement('select');
  select.className = 'admin-orders-toolbar__filter';
  [
    [STATUS_NEW, 'Нові'],
    [STATUS_PUBLISHED, 'Опубліковані'],
    [STATUS_REJECTED, 'Відхилені'],
    ['', 'Усі'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === statusFilter;
    select.appendChild(option);
  });
  select.addEventListener('change', () => renderReviews(container, password, select.value));
  toolbar.appendChild(select);
  container.appendChild(toolbar);

  const listEl = document.createElement('div');
  listEl.innerHTML = '<p class="state-message">Завантаження…</p>';
  container.appendChild(listEl);

  try {
    const result = await callApi('listReviews', { password });

    if (!result.ok) {
      listEl.innerHTML = '';
      const msg = document.createElement('p');
      msg.className = 'state-message state-message--error';
      msg.textContent = (result.error as string) || 'Не вдалося завантажити відгуки';
      listEl.appendChild(msg);
      return;
    }

    const reviews = (result.reviews as Review[]) ?? [];
    const filtered = statusFilter ? reviews.filter((review) => review.status === statusFilter) : reviews;
    const sorted = [...filtered].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    listEl.innerHTML = '';
    if (sorted.length === 0) {
      listEl.innerHTML = `<p class="state-message">${statusFilter === STATUS_NEW ? 'Нових відгуків немає' : 'Нічого не знайдено'}</p>`;
      return;
    }

    const onChanged = () => renderReviews(container, password, select.value);
    sorted.forEach((review) => listEl.appendChild(renderReviewCard(review, password, onChanged)));
  } catch {
    listEl.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'state-message state-message--error';
    msg.textContent = 'Не вдалося з’єднатися з сервером адмінки';
    listEl.appendChild(msg);
  }
}

export async function initReviewsTab(container: HTMLElement, password: string): Promise<void> {
  return renderReviews(container, password);
}
