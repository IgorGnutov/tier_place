// Прайс шиномонтажу з CSV: групована таблиця + fallback-картки для дуже вузьких екранів.
import { loadCsv } from './sheets';
import type { CsvRow } from './csv';
import { SHEET_SERVICE_CSV, LOCAL_SERVICE_CSV, CONTACTS, buildTelegramLink } from '../config';

const PRICE_COLUMNS = [
  { key: 'price_r13_r14', label: 'R13–R14' },
  { key: 'price_r15_r16', label: 'R15–R16' },
  { key: 'price_r17_r18', label: 'R17–R18' },
  { key: 'price_r19_plus', label: 'R19+' },
];

function priceCell(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed ? `${trimmed} грн` : '—';
}

function groupByCategory(rows: CsvRow[]): Map<string, CsvRow[]> {
  const groups = new Map<string, CsvRow[]>();
  rows.forEach((row) => {
    const category = row.category?.trim() || 'Інше';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(row);
  });
  return groups;
}

export async function initServicePrice(): Promise<void> {
  const tbody = document.getElementById('service-price-tbody');
  const cardsWrap = document.getElementById('service-price-cards');
  const stateWrap = document.getElementById('service-price-state');
  const bookBtn = document.getElementById('service-book-btn') as HTMLAnchorElement | null;
  const batteryBtn = document.getElementById('battery-contact-btn') as HTMLAnchorElement | null;
  const telegramLinkEl = document.getElementById('contacts-telegram-link') as HTMLAnchorElement | null;
  const floatingCta = document.getElementById('floating-telegram') as HTMLAnchorElement | null;

  if (bookBtn) bookBtn.href = buildTelegramLink('Вітаю, хочу записатись на шиномонтаж');
  if (batteryBtn) batteryBtn.href = CONTACTS.telegramUrl;
  if (telegramLinkEl) telegramLinkEl.href = CONTACTS.telegramUrl;
  if (floatingCta) floatingCta.href = CONTACTS.telegramUrl;

  if (!tbody || !cardsWrap) return;

  const result = await loadCsv(SHEET_SERVICE_CSV, LOCAL_SERVICE_CSV);

  if (result.rows.length === 0) {
    if (stateWrap) {
      stateWrap.innerHTML = '';
      const msg = document.createElement('p');
      msg.className = 'state-message state-message--error';
      msg.textContent = result.error ? `Прайс тимчасово недоступний: ${result.error}` : 'Прайс поки не заповнено.';
      stateWrap.appendChild(msg);
    }
    return;
  }

  const groups = groupByCategory(result.rows);

  tbody.innerHTML = '';
  groups.forEach((rows, category) => {
    const groupRow = document.createElement('tr');
    const th = document.createElement('th');
    th.colSpan = 5;
    th.scope = 'colgroup';
    th.textContent = category;
    th.style.background = 'var(--color-bg-raised)';
    th.style.color = 'var(--color-accent)';
    groupRow.appendChild(th);
    tbody.appendChild(groupRow);

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = row.unit ? `${row.service} (${row.unit})` : row.service ?? '';
      tr.appendChild(nameCell);
      PRICE_COLUMNS.forEach((col) => {
        const td = document.createElement('td');
        td.textContent = priceCell(row[col.key]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });

  cardsWrap.innerHTML = '';
  groups.forEach((rows, category) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'price-cards__group';
    const title = document.createElement('div');
    title.className = 'price-cards__title';
    title.textContent = category;
    groupDiv.appendChild(title);

    rows.forEach((row) => {
      const line = document.createElement('div');
      line.className = 'price-cards__row';
      const name = document.createElement('span');
      name.className = 'price-cards__row-name';
      name.textContent = row.unit ? `${row.service} (${row.unit})` : row.service ?? '';
      const price = document.createElement('span');
      price.className = 'price-cards__row-price';
      price.textContent = priceCell(row.price_r13_r14) === '—' ? priceCell(row.price_r15_r16) : priceCell(row.price_r13_r14);
      line.append(name, price);
      groupDiv.appendChild(line);
    });
    cardsWrap.appendChild(groupDiv);
  });

  if (result.error && stateWrap) {
    stateWrap.innerHTML = '';
    const warn = document.createElement('p');
    warn.className = 'state-message';
    warn.textContent = 'Показано демо-прайс — таблиця тимчасово недоступна.';
    stateWrap.appendChild(warn);
  }
}
