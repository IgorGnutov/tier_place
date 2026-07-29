// Хедер: бургер-меню, підсвітка активного пункту через IntersectionObserver,
// тінь при скролі. Плавний скрол вже забезпечує CSS (scroll-behavior: smooth).

let activeCatalogTab: 'tires' | 'wheels' = 'tires';

function closeMenu(nav: HTMLElement, burger: HTMLButtonElement): void {
  nav.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
}

export function initNav(): void {
  const header = document.getElementById('site-header');
  const nav = document.getElementById('main-nav');
  const burger = document.getElementById('burger') as HTMLButtonElement | null;
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));

  if (burger && nav) {
    burger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.forEach((link) => {
      link.addEventListener('click', () => closeMenu(nav, burger));
    });

    // Esc закриває меню, фокус повертається на бургер
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeMenu(nav, burger);
        burger.focus();
      }
    });
  }

  // Тінь хедера при скролі
  if (header) {
    const onScroll = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  window.addEventListener('tab-changed', (e) => {
    activeCatalogTab = (e as CustomEvent<{ type: 'tires' | 'wheels' }>).detail.type;
    updateActiveHighlight();
  });

  const headerNavAnchors = navLinks.filter((l) => l.closest('#main-nav'));
  const menuLinkByHash = new Map<string, HTMLAnchorElement>();
  headerNavAnchors.forEach((link) => {
    const hash = new URL(link.href).hash;
    if (hash) menuLinkByHash.set(hash, link);
  });

  function updateActiveHighlight(): void {
    headerNavAnchors.forEach((link) => link.classList.remove('is-active'));
    const activeHash = document.body.dataset.activeSection;
    if (!activeHash) return;

    if (activeHash === '#tires-wheels-section') {
      const link = menuLinkByHash.get(activeCatalogTab === 'wheels' ? '#wheels' : '#tires');
      link?.classList.add('is-active');
    } else {
      menuLinkByHash.get(activeHash)?.classList.add('is-active');
    }
  }

  const observedSections = Array.from(
    document.querySelectorAll<HTMLElement>(
      '#home, #tires-wheels-section, #service, #batteries, #contacts'
    )
  );

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        document.body.dataset.activeSection = `#${visible.target.id}`;
        updateActiveHighlight();
      }
    },
    { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  observedSections.forEach((section) => observer.observe(section));
}
