// Кнопки шиномонтажу/акумуляторів: підставляємо готові Telegram-посилання.
import { CONTACTS, buildTelegramLink } from '../config';

export function initServiceCta(): void {
  const bookBtn = document.getElementById('service-book-btn') as HTMLAnchorElement | null;
  const batteryBtn = document.getElementById('battery-contact-btn') as HTMLAnchorElement | null;
  const telegramLinkEl = document.getElementById('contacts-telegram-link') as HTMLAnchorElement | null;
  const floatingCta = document.getElementById('floating-telegram') as HTMLAnchorElement | null;

  if (bookBtn) bookBtn.href = buildTelegramLink('Вітаю, хочу записатись на шиномонтаж');
  if (batteryBtn) batteryBtn.href = CONTACTS.telegramUrl;
  if (telegramLinkEl) telegramLinkEl.href = CONTACTS.telegramUrl;
  if (floatingCta) floatingCta.href = CONTACTS.telegramUrl;
}
