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
