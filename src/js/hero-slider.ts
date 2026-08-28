// Vanilla-слайдер для hero: crossfade (тільки opacity, без CLS), автоплей,
// пауза на hover/focus/document.hidden/prefers-reduced-motion, свайп, клавіатура, ARIA.
import { gallerySlides, type GallerySlide } from '../data/gallery';
import { t } from './i18n';

const AUTOPLAY_MS = 5000;
const SWIPE_THRESHOLD = 40;

function buildSources(slide: GallerySlide): string {
  const dir = 'assets/photos/optimized';
  const widths = [480, 768, 1200];
  const srcset = (ext: string) =>
    widths.map((w) => `${dir}/${slide.base}-${w}.${ext} ${w}w`).join(', ');

  return `
    <picture>
      <source type="image/avif" srcset="${srcset('avif')}" sizes="100vw" />
      <source type="image/webp" srcset="${srcset('webp')}" sizes="100vw" />
      <img
        src="${dir}/${slide.base}-1200.${slide.fallbackExt}"
        srcset="${srcset(slide.fallbackExt)}"
        sizes="100vw"
        width="${slide.width}"
        height="${slide.height}"
        alt="${slide.alt}"
        loading="lazy"
        decoding="async"
      />
    </picture>
  `;
}

export function initHeroSlider(): void {
  const root = document.getElementById('hero-slider');
  const track = document.getElementById('hero-slides');
  const dotsWrap = document.getElementById('hero-dots');
  const prevBtn = document.getElementById('hero-prev') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('hero-next') as HTMLButtonElement | null;
  const playPauseBtn = document.getElementById('hero-play-pause') as HTMLButtonElement | null;
  const counter = document.getElementById('hero-counter');
  if (!root || !track || !dotsWrap) return;

  const slides = gallerySlides.length > 0 ? gallerySlides : [];
  const total = slides.length;

  // Слайд №0 уже є в HTML (реальний <img>, eager, для LCP) — решту додаємо динамічно.
  const existingFirstSlide = track.querySelector<HTMLElement>('[data-slide-index="0"]');
  if (existingFirstSlide && total > 0) {
    existingFirstSlide.setAttribute('role', 'group');
    existingFirstSlide.setAttribute('aria-roledescription', 'slide');
    existingFirstSlide.setAttribute('aria-label', `1 ${t('a11y.of', 'з')} ${total}`);
  }

  for (let i = 1; i < total; i++) {
    const slide = slides[i];
    const figure = document.createElement('figure');
    figure.className = 'hero__slide';
    figure.dataset.slideIndex = String(i);
    figure.setAttribute('role', 'group');
    figure.setAttribute('aria-roledescription', 'slide');
    figure.setAttribute('aria-label', `${i + 1} ${t('a11y.of', 'з')} ${total}`);
    figure.innerHTML = buildSources(slide);
    track.appendChild(figure);
  }

  // Якщо фото ще немає зовсім — приховуємо керування, слайд-заглушка вже в HTML.
  if (total <= 1) {
    dotsWrap.hidden = true;
    prevBtn?.setAttribute('hidden', '');
    nextBtn?.setAttribute('hidden', '');
    playPauseBtn?.setAttribute('hidden', '');
    return;
  }

  const slideEls = Array.from(track.querySelectorAll<HTMLElement>('.hero__slide'));

  slideEls.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'hero__dot';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Слайд ${i + 1} ${t('a11y.of', 'з')} ${total}`);
    dot.addEventListener('click', () => goTo(i, true));
    dotsWrap.appendChild(dot);
  });
  const dotEls = Array.from(dotsWrap.querySelectorAll<HTMLButtonElement>('.hero__dot'));

  let current = 0;
  let timer: number | undefined;
  let isPaused = false;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render(): void {
    slideEls.forEach((el, i) => el.classList.toggle('is-active', i === current));
    dotEls.forEach((el, i) => el.classList.toggle('is-active', i === current));
    if (counter) counter.textContent = `Слайд ${current + 1} ${t('a11y.of', 'з')} ${total}`;
  }

  function goTo(index: number, userInitiated = false): void {
    current = (index + total) % total;
    render();
    if (userInitiated) restartAutoplay();
  }

  function next(): void {
    goTo(current + 1);
  }

  function prev(): void {
    goTo(current - 1);
  }

  function startAutoplay(): void {
    if (prefersReducedMotion || isPaused) return;
    stopAutoplay();
    timer = window.setInterval(next, AUTOPLAY_MS);
  }

  function stopAutoplay(): void {
    if (timer) window.clearInterval(timer);
  }

  function restartAutoplay(): void {
    stopAutoplay();
    startAutoplay();
  }

  prevBtn?.addEventListener('click', () => prev());
  nextBtn?.addEventListener('click', () => next());

  if (playPauseBtn) {
    const setPlayPauseLabel = () => {
      playPauseBtn.setAttribute(
        'aria-label',
        isPaused ? t('a11y.heroPlayLabel', 'Відтворити автоперемикання слайдів') : t('a11y.heroPauseLabel', 'Пауза автоперемикання слайдів')
      );
      playPauseBtn.textContent = isPaused ? '▶' : '❚❚';
    };
    setPlayPauseLabel();
    playPauseBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      setPlayPauseLabel();
      if (isPaused) stopAutoplay();
      else startAutoplay();
    });
  }

  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', () => !isPaused && startAutoplay());
  root.addEventListener('focusin', stopAutoplay);
  root.addEventListener('focusout', () => !isPaused && startAutoplay());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay();
    else if (!isPaused) startAutoplay();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      next();
      (document.activeElement as HTMLElement | null)?.blur();
    }
    if (e.key === 'ArrowLeft') {
      prev();
    }
  });

  // Свайп на тач-екранах (Pointer Events)
  let pointerStartX: number | null = null;
  track.addEventListener('pointerdown', (e) => {
    pointerStartX = e.clientX;
  });
  track.addEventListener('pointerup', (e) => {
    if (pointerStartX === null) return;
    const delta = e.clientX - pointerStartX;
    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      if (delta < 0) next();
      else prev();
    }
    pointerStartX = null;
  });

  render();
  startAutoplay();
}
