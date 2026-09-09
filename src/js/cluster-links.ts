// Блок перелінковки на хаби/фасети/послуги прередериться в HTML
// (scripts/lib/cluster-links.mjs), і копія його посилань живе в src/data/cluster-pages.json —
// не в src/i18n/ru.json. Тому штатний applyStaticTranslations() про ці підписи не знає:
// ярлики рядків блоку він перекладає (у них є data-i18n), а самі посилання — ні.
//
// На головній перемикач мови працює БЕЗ перезавантаження (i18n.ts, pushState), тож без цього
// модуля після RU → UA блок лишався б російським і вів на /ru/tires/r14/ — користувач, який
// щойно обрав українську, потрапляв би на російську сторінку.
//
// На кластерних сторінках перемикач — справжня навігація, тож мова там не змінюється на місці;
// цей код лише підтверджує вже правильні значення. No-op на сторінках без блоку.
import { getLang, onLangChange } from './i18n';

function applyClusterLinkLang(): void {
  const lang = getLang();
  document.querySelectorAll<HTMLAnchorElement>('.cluster-links a[data-uk-href]').forEach((link) => {
    const href = lang === 'ru' ? link.dataset.ruHref : link.dataset.ukHref;
    const label = lang === 'ru' ? link.dataset.ruLabel : link.dataset.ukLabel;
    if (href) link.setAttribute('href', href);
    if (label) link.textContent = label;
  });
}

export function initClusterLinks(): void {
  applyClusterLinkLang();
  onLangChange(applyClusterLinkLang);
}
