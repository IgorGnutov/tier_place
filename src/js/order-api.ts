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
    return { ok: false, error: 'Не вдалося з\'єднатися з сервером. Перевірте інтернет і спробуйте ще раз.' };
  }
}
