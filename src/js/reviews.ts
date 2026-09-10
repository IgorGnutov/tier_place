// Форма відгуку на сторінці товару — розмітку генерує scripts/generate-product-pages.mjs під
// час білда, тут лише відправка. Відгук іде на той самий Apps Script Web App, що й замовлення,
// зі статусом "Нове": на сайт він потрапляє лише після схвалення в /admin і наступної перебудови.
import { CONTENT_API_URL } from '../config';
import { t } from './i18n';

const AUTHOR_MIN = 2;
const AUTHOR_MAX = 60;
const BODY_MIN = 10;
const BODY_MAX = 1000;

/** Підстановка меж у переклад. Числа не можна вбудовувати в самі рядки словника: вони мусять
 *  лишатись синхронними з константами вище і з validateReview_ у Code.gs. */
function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
}

// Дзеркалить validateReview_ у Code.gs, щоб людина побачила помилку без запиту. Справжня
// перевірка — серверна: цю можна обійти запитом напряму на Web App.
function validate(rating: string, author: string, body: string): string | null {
  if (!rating) return t('review.errNoRating', 'Поставте оцінку');
  if (author.length < AUTHOR_MIN || author.length > AUTHOR_MAX) {
    return fill(t('review.errAuthorLen', "Ім'я має бути від {min} до {max} символів"), {
      min: AUTHOR_MIN,
      max: AUTHOR_MAX,
    });
  }
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return fill(t('review.errBodyLen', 'Відгук має бути від {min} до {max} символів'), {
      min: BODY_MIN,
      max: BODY_MAX,
    });
  }
  return null;
}

export function initReviews(): void {
  const form = document.getElementById('review-form') as HTMLFormElement | null;
  const dataEl = document.getElementById('product-data');
  if (!form || !dataEl) return;

  let product: { id?: string; title?: string };
  try {
    product = JSON.parse(dataEl.textContent ?? '{}');
  } catch {
    return;
  }
  if (!product.id) return;

  const statusEl = document.getElementById('review-status') as HTMLElement | null;
  const submitBtn = document.getElementById('review-submit') as HTMLButtonElement | null;
  // Разом із honeypot-полем відсіює найпростіших ботів: людина не заповнить форму за секунду.
  const renderedAt = Date.now();

  const setStatus = (message: string, isError = false): void => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('review-form__status--error', isError);
  };

  form.addEventListener('submit', async (event) => {
    // Нативний сабміт заблокувало б form-action 'self' у CSP — відправляємо через fetch.
    event.preventDefault();

    const data = new FormData(form);
    const rating = String(data.get('rating') ?? '');
    const author = String(data.get('author') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();

    const invalid = validate(rating, author, body);
    if (invalid) {
      setStatus(invalid, true);
      return;
    }

    if (!CONTENT_API_URL) {
      setStatus(t('review.errNotConfigured', 'Відгуки ще не налаштовані на цьому сайті'), true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setStatus(t('review.sending', 'Надсилаємо…'));

    try {
      // body без явного Content-Type лишається text/plain — так Apps Script Web App уникає
      // CORS preflight (той самий прийом, що в order-api.ts і admin/api.ts).
      const response = await fetch(CONTENT_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'review',
          productId: product.id,
          productTitle: product.title ?? '',
          productUrl: location.href,
          author,
          body,
          rating: Number(rating),
          website: String(data.get('website') ?? ''),
          elapsedMs: Date.now() - renderedAt,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as { ok: boolean; error?: string };

      if (!result.ok) {
        // result.error приходить із Apps Script українською — перекладу там немає, тож fallback
        // локалізований, а серверний текст показуємо як є.
        setStatus(result.error || t('review.errSaveFallback', 'Не вдалося зберегти відгук'), true);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // Форма більше не потрібна: відгук у черзі модерації, повторна відправка створила б дубль.
      form.querySelectorAll('input, textarea, button').forEach((el) => {
        (el as HTMLInputElement).disabled = true;
      });
      setStatus(t('review.thanks', 'Дякуємо! Відгук з’явиться на сайті після перевірки.'));
    } catch {
      setStatus(
        t('review.errNetwork', 'Не вдалося з’єднатися з сервером. Перевірте інтернет і спробуйте ще раз.'),
        true
      );
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
