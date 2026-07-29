// Слайди hero-слайдера. Кожен слот відповідає реальному фото магазину.
// Як додати фото — див. README.md, розділ "Як додати або замінити фото в слайдері".
export interface GallerySlide {
  /** Базове ім'я файлу без розширення в assets/photos/optimized/ (без "-{width}.{ext}") */
  base: string;
  /** Розширення оригінального фолбек-файлу в assets/photos/ */
  fallbackExt: 'jpg';
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

// Порядок показу: вивіска першою (це LCP-слайд — прописана вітрина магазину),
// далі товарні слоти в міру появи фото від власника.
export const gallerySlides: GallerySlide[] = [
  {
    base: 'tire-place-kryvyi-rih-vyviska-1',
    fallbackExt: 'jpg',
    width: 1200,
    height: 900,
    alt: 'Вивіска автомагазину TIRE PLACE на авторинку «Термінал» у Кривому Розі — шини, диски, акумулятори',
    caption: 'Наш магазин на авторинку «Термінал», Кривий Ріг',
  },
  {
    base: 'tire-place-kryvyi-rih-shyny-1',
    fallbackExt: 'jpg',
    width: 1200,
    height: 868,
    alt: 'Легкові шини в наявності на стелажах в автомагазині TIRE PLACE, Кривий Ріг',
  },
  // TODO: додати фото-слоти для дисків, акумуляторів і зони шиномонтажу, коли власник надасть фото:
  // { base: 'tire-place-kryvyi-rih-dyski-1', ... }
  // { base: 'tire-place-kryvyi-rih-akumulyatory-1', ... }
  // { base: 'tire-place-kryvyi-rih-shynomontazh-1', ... }
];
