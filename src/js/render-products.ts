// Каталог шин і дисків: завантаження з CSV, залежні фільтри, сортування,
// "показати ще", стани завантаження/помилки/порожньо, картки з кнопкою Telegram.
import { loadCsv } from './sheets';
import { parseBool, parsePrice, type CsvRow } from './csv';
import {
  filterRows,
  optionsForField,
  readRangeFromUrl,
  readStateFromUrl,
  writeStateToUrl,
  type FieldDef,
  type FilterState,
} from './filters';
import { buildTelegramLink, copyRequestText } from './telegram';
import {
  SHEET_TIRES_CSV,
  SHEET_WHEELS_CSV,
  LOCAL_TIRES_CSV,
  LOCAL_WHEELS_CSV,
} from '../config';

const PAGE_SIZE = 9;

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

interface CatalogConfig {
  idPrefix: 'tires' | 'wheels';
  sheetUrl: string;
  localUrl: string;
  fields: FieldDef[];
  describe: (row: CsvRow) => CardInfo;
}

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function requireEl<T extends HTMLElement>(id: string): T {
  const found = el<T>(id);
  if (!found) throw new Error(`Очікуваний елемент #${id} не знайдено в розмітці`);
  return found;
}

function renderSkeleton(grid: HTMLElement): void {
  grid.innerHTML = '';
  grid.classList.add('product-grid--skeleton');
  for (let i = 0; i < 6; i++) {
    const card = document.createElement('div');
    card.className = 'product-card skeleton';
    grid.appendChild(card);
  }
}

function renderCard(info: CardInfo): HTMLElement {
  const card = document.createElement('article');
  card.className = 'product-card';

  if (info.imageUrl !== undefined) {
    const photo = document.createElement('div');
    photo.className = 'product-card__photo';
    if (info.imageUrl) {
      const img = document.createElement('img');
      img.src = info.imageUrl;
      img.alt = info.title;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        // Посилання не веде напряму на файл картинки (сторінка перегляду Google Drive,
        // видалене фото тощо) — показуємо плейсхолдер замість зламаної іконки браузера.
        photo.innerHTML = '';
        photo.classList.add('product-card__photo--placeholder');
      });
      photo.appendChild(img);
    } else {
      photo.classList.add('product-card__photo--placeholder');
    }
    card.appendChild(photo);
  }

  const title = document.createElement('h3');
  title.className = 'product-card__title';
  title.textContent = info.title;
  card.appendChild(title);

  const specs = document.createElement('ul');
  specs.className = 'product-card__specs';
  info.specs.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = `${s.label}: ${s.value}`;
    specs.appendChild(li);
  });
  card.appendChild(specs);

  const status = document.createElement('span');
  status.className = `status ${info.inStock ? 'status--in' : 'status--out'}`;
  status.textContent = info.inStock ? 'В наявності' : 'Немає в наявності';
  card.appendChild(status);

  const footer = document.createElement('div');
  footer.className = 'product-card__footer';

  const price = document.createElement('span');
  price.className = 'product-card__price';
  price.textContent = info.price !== null ? `${info.price.toLocaleString('uk-UA')} грн` : 'Ціна за запитом';
  footer.appendChild(price);

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
  card.appendChild(footer);

  return card;
}

function renderState(container: HTMLElement, message: string, isError: boolean, onRetry?: () => void): void {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = `state-message${isError ? ' state-message--error' : ''}`;
  wrap.textContent = message;
  container.appendChild(wrap);

  if (onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn--outline btn--small';
    retryBtn.textContent = 'Спробувати ще';
    retryBtn.style.marginTop = '1rem';
    retryBtn.addEventListener('click', onRetry);
    wrap.after(retryBtn);
  }
}

async function initCatalog(config: CatalogConfig): Promise<void> {
  const { idPrefix, fields } = config;
  let grid: HTMLElement, countEl: HTMLElement, sortEl: HTMLSelectElement, chipsEl: HTMLElement, form: HTMLFormElement;
  try {
    grid = requireEl<HTMLElement>(`${idPrefix}-grid`);
    countEl = requireEl<HTMLElement>(`${idPrefix}-count`);
    sortEl = requireEl<HTMLSelectElement>(`${idPrefix}-sort`);
    chipsEl = requireEl<HTMLElement>(`${idPrefix}-chips`);
    form = requireEl<HTMLFormElement>(`${idPrefix}-filters`);
  } catch (err) {
    console.error(err);
    return;
  }
  const loadMoreWrap = el<HTMLElement>(`${idPrefix}-load-more-wrap`);
  const loadMoreBtn = el<HTMLButtonElement>(`${idPrefix}-load-more`);
  const resetBtn = form.querySelector<HTMLButtonElement>('[data-reset]');

  renderSkeleton(grid);
  countEl.textContent = 'Завантаження…';

  const result = await loadCsv(config.sheetUrl, config.localUrl);

  if (result.rows.length === 0) {
    renderState(
      grid,
      result.error ? `Не вдалося завантажити дані: ${result.error}` : 'Товарів поки немає.',
      Boolean(result.error),
      () => initCatalog(config)
    );
    countEl.textContent = '';
    return;
  }

  if (result.error) {
    // Показали фолбек-дані, але попереджаємо, що це не "живі" дані з таблиці.
    countEl.dataset.warning = result.error;
  }

  const rows = result.rows;
  let state: FilterState = readStateFromUrl(idPrefix, fields);
  const range = readRangeFromUrl(idPrefix);
  let visibleCount = PAGE_SIZE;

  const priceMinInput = el<HTMLInputElement>(`${idPrefix}-price-min`);
  const priceMaxInput = el<HTMLInputElement>(`${idPrefix}-price-max`);
  if (priceMinInput) priceMinInput.value = range.min;
  if (priceMaxInput) priceMaxInput.value = range.max;

  function buildSelects(): void {
    fields.forEach((field) => {
      const select = el<HTMLSelectElement>(`${idPrefix}-${field.key}`);
      if (!select) return;
      const currentValue = state[field.key] ?? '';
      const placeholder = select.querySelector('option[value=""]');
      const options = optionsForField(rows, fields, state, field.key);

      select.innerHTML = '';
      if (placeholder) select.appendChild(placeholder);
      options.forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = field.key === 'diameter' ? `R${opt.label}` : opt.label;
        select.appendChild(optionEl);
      });

      // Якщо поточне значення більше не доступне серед відфільтрованих варіантів — скидаємо його.
      if (currentValue && !options.some((o) => o.value === currentValue)) {
        delete state[field.key];
        select.value = '';
      } else {
        select.value = currentValue;
      }
    });
  }

  function renderChips(): void {
    chipsEl.innerHTML = '';
    fields.forEach((field) => {
      const value = state[field.key];
      if (!value) return;
      const label = field.key === 'diameter' ? `R${value}` : value === 'true' ? 'Так' : value === 'false' ? 'Ні' : value;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${field.label}: ${label} <button type="button" aria-label="Прибрати фільтр ${field.label}">×</button>`;
      chip.querySelector('button')?.addEventListener('click', () => {
        delete state[field.key];
        const select = el<HTMLSelectElement>(`${idPrefix}-${field.key}`);
        if (select) select.value = '';
        onFiltersChanged();
      });
      chipsEl.appendChild(chip);
    });
  }

  function renderResults(): void {
    const priceMin = priceMinInput?.value ? Number.parseFloat(priceMinInput.value) : null;
    const priceMax = priceMaxInput?.value ? Number.parseFloat(priceMaxInput.value) : null;

    let filtered = filterRows(rows, fields, state, priceMin, priceMax, (row) => config.describe(row).price);

    const sortValue = sortEl.value;
    if (sortValue === 'price-asc') {
      filtered = [...filtered].sort((a, b) => (config.describe(a).price ?? Infinity) - (config.describe(b).price ?? Infinity));
    } else if (sortValue === 'price-desc') {
      filtered = [...filtered].sort((a, b) => (config.describe(b).price ?? -Infinity) - (config.describe(a).price ?? -Infinity));
    } else if (sortValue === 'name-asc') {
      filtered = [...filtered].sort((a, b) => config.describe(a).title.localeCompare(config.describe(b).title, 'uk'));
    }

    grid.classList.remove('product-grid--skeleton');
    grid.innerHTML = '';

    if (filtered.length === 0) {
      renderState(grid, 'Нічого не знайдено за обраними фільтрами.', false);
    } else {
      filtered.slice(0, visibleCount).forEach((row) => grid.appendChild(renderCard(config.describe(row))));
    }

    const warningSuffix = countEl.dataset.warning ? ' (показано демо-дані, таблиця тимчасово недоступна)' : '';
    countEl.textContent = `Знайдено: ${filtered.length}${warningSuffix}`;

    if (loadMoreWrap) loadMoreWrap.hidden = filtered.length <= visibleCount;
  }

  function onFiltersChanged(resetPage = true): void {
    if (resetPage) visibleCount = PAGE_SIZE;
    buildSelects();
    renderChips();
    renderResults();
    writeStateToUrl(idPrefix, fields, state, priceMinInput?.value ?? '', priceMaxInput?.value ?? '');
  }

  fields.forEach((field) => {
    const select = el<HTMLSelectElement>(`${idPrefix}-${field.key}`);
    select?.addEventListener('change', () => {
      if (select.value) state[field.key] = select.value;
      else delete state[field.key];
      onFiltersChanged();
    });
  });

  [priceMinInput, priceMaxInput].forEach((input) => {
    input?.addEventListener('input', () => onFiltersChanged(true));
  });

  sortEl.addEventListener('change', () => renderResults());

  resetBtn?.addEventListener('click', () => {
    state = {};
    if (priceMinInput) priceMinInput.value = '';
    if (priceMaxInput) priceMaxInput.value = '';
    onFiltersChanged();
  });

  loadMoreBtn?.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderResults();
  });

  buildSelects();
  renderChips();
  renderResults();
}

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

const TIRES_FIELDS: FieldDef[] = [
  { key: 'width', label: 'Ширина' },
  { key: 'profile', label: 'Профіль' },
  { key: 'diameter', label: 'Діаметр' },
  { key: 'season', label: 'Сезон' },
  { key: 'studded', label: 'Шипи', boolean: true },
  { key: 'brand', label: 'Бренд' },
];

const WHEELS_FIELDS: FieldDef[] = [
  { key: 'diameter', label: 'Діаметр' },
  { key: 'width', label: 'Ширина' },
  { key: 'pcd', label: 'PCD' },
  { key: 'et', label: 'ET' },
  { key: 'dia', label: 'DIA' },
  { key: 'type', label: 'Тип' },
  { key: 'brand', label: 'Бренд' },
];

export function initCatalogs(): void {
  initCatalog({
    idPrefix: 'tires',
    sheetUrl: SHEET_TIRES_CSV,
    localUrl: LOCAL_TIRES_CSV,
    fields: TIRES_FIELDS,
    describe: tiresDescribe,
  });
  initCatalog({
    idPrefix: 'wheels',
    sheetUrl: SHEET_WHEELS_CSV,
    localUrl: LOCAL_WHEELS_CSV,
    fields: WHEELS_FIELDS,
    describe: wheelsDescribe,
  });
}

// --- Перемикання табів "Шини" / "Диски" ---
export function initCatalogTabs(): void {
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel'));

  function activate(type: 'tires' | 'wheels'): void {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === type;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    panels.forEach((panel) => panel.classList.toggle('is-active', panel.id === type));
    window.dispatchEvent(new CustomEvent('tab-changed', { detail: { type } }));
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.tab === 'wheels' ? 'wheels' : 'tires'));
  });

  // Клік по пункту меню "Диски" має відкрити таб і проскролити до каталогу
  // (панель "Диски" прихована через display:none, доки не активна).
  document.querySelectorAll<HTMLAnchorElement>('a[data-nav-link][href="#wheels"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activate('wheels');
      document.getElementById('tires-wheels-section')?.scrollIntoView({ behavior: 'smooth' });
      history.replaceState(null, '', '#wheels');
    });
  });
  document.querySelectorAll<HTMLAnchorElement>('a[data-nav-link][href="#tires"]').forEach((link) => {
    link.addEventListener('click', () => activate('tires'));
  });

  if (window.location.hash === '#wheels') activate('wheels');
}
