import './styles/main.css';
import { initNav } from './js/nav';
import { initHeroSlider } from './js/hero-slider';
import { initCatalogs, initCatalogTabs } from './js/render-products';
import { initServiceCta } from './js/render-service';
import { initMap } from './js/map';
import { initContent } from './js/content';

function initFooterYear(): void {
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

function initFloatingCta(): void {
  const cta = document.getElementById('floating-telegram');
  const hero = document.getElementById('home');
  if (!cta || !hero) return;

  const observer = new IntersectionObserver(
    ([entry]) => cta.classList.toggle('is-visible', !entry.isIntersecting),
    { threshold: 0 }
  );
  observer.observe(hero);
}

initNav();
initCatalogTabs();
initHeroSlider();
initCatalogs();
initServiceCta();
initMap();
initFooterYear();
initFloatingCta();
initContent();
