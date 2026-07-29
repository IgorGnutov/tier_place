// Лінива вставка Google Maps iframe — тільки за кліком, щоб не вантажити мапу одразу.
import { CONTACTS } from '../config';

export function initMap(): void {
  const showBtn = document.getElementById('map-show-btn');
  const wrap = document.getElementById('map-wrap');
  const placeholder = document.getElementById('map-placeholder');
  const routeLink = document.getElementById('map-route-link') as HTMLAnchorElement | null;

  if (routeLink) routeLink.href = CONTACTS.mapPlaceUrl;

  showBtn?.addEventListener('click', () => {
    if (!wrap) return;
    const iframe = document.createElement('iframe');
    iframe.src = CONTACTS.mapEmbedSrc;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    iframe.title = 'Карта: автомагазин TIRE PLACE, авторинок «Термінал», Кривий Ріг';
    placeholder?.remove();
    wrap.appendChild(iframe);
  });
}
