// Кнопки шиномонтажу/акумуляторів: підставляємо готові Telegram-посилання.
import { CONTACTS, buildTelegramLink } from '../config';
import { t, onLangChange } from './i18n';

export function initServiceCta(): void {
  const bookBtn = document.getElementById('service-book-btn') as HTMLAnchorElement | null;
  const batteryBtn = document.getElementById('battery-contact-btn') as HTMLAnchorElement | null;
  const telegramLinkEl = document.getElementById('contacts-telegram-link') as HTMLAnchorElement | null;
  const floatingCta = document.getElementById('floating-telegram') as HTMLAnchorElement | null;

  function refresh(): void {
    if (bookBtn) bookBtn.href = buildTelegramLink(t('service.bookMessage', 'Вітаю, хочу записатись на шиномонтаж'));
  }

  refresh();
  onLangChange(refresh);

  if (batteryBtn) batteryBtn.href = CONTACTS.telegramUrl;
  if (telegramLinkEl) telegramLinkEl.href = CONTACTS.telegramUrl;
  if (floatingCta) floatingCta.href = CONTACTS.telegramUrl;
}
