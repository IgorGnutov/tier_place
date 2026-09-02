// Плаский словник RU-перекладів. Ключ відсутній тут = слово однакове в обох мовах
// (напр. "Диски", "Бренд") — t()/applyStaticTranslations просто лишають український
// оригінал. Українські рядки НЕ дублюються тут — вони живуть в index.html/*.ts як є.
//
// head/meta.* рядки винесені в ./ru-meta.json — той самий файл читає
// scripts/generate-ru-html.mjs при білді, щоб RU-мета (og:title/description/twitter:*)
// потрапляла у статичний dist/ru/index.html для соцботів, які не виконують JS.
import ruMeta from './ru-meta.json';

export const RU_STRINGS: Record<string, string> = {
  // --- nav ---
  'nav.tires': 'Шины',
  'nav.batteries': 'Аккумуляторы',
  'nav.contacts': 'Контакты',

  // --- head / meta ---
  ...ruMeta,

  // --- hero ---
  'hero.trust1': 'В наличии и на складе',
  'hero.trust2': 'Подбор шин и дисков под ваш автомобиль',
  'hero.trust3': 'Монтаж на месте',
  'hero.trust4': 'Самовывоз и доставка Новой Почтой',
  'cta.buyTires': 'Купить шины и диски',
  'cta.bookService': 'Записаться на шиномонтаж',
  'hero.credit': 'Фото нашего магазина на авторынке «Терминал»',
  'hero.lcpImageAlt':
    'Вывеска автомагазина TIRE PLACE на авторынке «Терминал» в Кривом Роге — шины, диски, аккумуляторы',

  // --- catalog / filters ---
  'catalog.headingHtml': '<span class="accent">Шины</span> и диски в Кривом Роге',
  'catalog.tabsAria': 'Каталог шин и дисков',
  'filters.profile': 'Профиль',
  'filters.diameter': 'Диаметр (R)',
  'filters.studded': 'Шипы',
  'filters.priceLabel': 'Цена, грн',
  'filters.priceFrom': 'от',
  'filters.anyM': 'Любой',
  'filters.anyF': 'Любая',
  'filters.notImportant': 'Не важно',
  'filters.reset': 'Сбросить фильтр',
  'filters.sortAria': 'Сортировка',
  'filters.sortDefault': 'По умолчанию',
  'filters.sortPriceAsc': 'Цена: сначала дешевле',
  'filters.sortPriceDesc': 'Цена: сначала дороже',
  'filters.sortNameAsc': 'По названию (А–Я)',
  'filters.pcd': 'Разболтовка (PCD)',
  'filters.et': 'Вылет (ET)',
  'filters.year': 'Год',
  'filters.country': 'Страна',
  'product.loading': 'Загрузка…',
  'product.loadMore': 'Показать ещё',

  // --- product cards / catalog state ---
  'product.loadIndex': 'Индекс нагрузки',
  'product.speedIndex': 'Индекс скорости',
  'product.color': 'Цвет',
  'product.yes': 'Да',
  'product.no': 'Нет',
  'product.inStock': 'В наличии',
  'product.outOfStock': 'Нет в наличии',
  'product.buy': 'Купить',
  'product.priceOnRequest': 'Цена по запросу',
  'product.foundLabel': 'Найдено',
  'product.foundDemoSuffix': ' (показаны демо-данные, таблица временно недоступна)',
  'product.notFound': 'Ничего не найдено по выбранным фильтрам.',
  'product.loadErrorPrefix': 'Не удалось загрузить данные: ',
  'product.noProductsYet': 'Товаров пока нет.',
  'product.retry': 'Попробовать ещё раз',
  'product.removeFilterAria': 'Убрать фильтр',
  'product.addedToCart': 'Добавлено в корзину',

  // --- service ---
  'service.eyebrow': 'Услуги',
  'service.headingHtml': 'Шиномонтаж <span class="accent">без очереди</span>',
  'service.bookMessage': 'Здравствуйте, хочу записаться на шиномонтаж',

  // --- batteries ---
  'battery.eyebrow': 'В наличии',
  'battery.headingHtml': 'Автомобильные <span class="accent">аккумуляторы</span>',
  'battery.contactBtn': 'Свяжитесь с нами',

  // --- contacts ---
  'contacts.eyebrow': 'Где мы',
  'contacts.headingHtml': 'Контакты <span class="accent">TIRE PLACE</span>',
  'contacts.addressLabel': 'Адрес',
  'contacts.addressValue': 'Авторынок «Терминал», улица Никопольское шоссе 1Г, Кривой Рог',
  'contacts.hoursLabel': 'График работы',
  'contacts.socialsLabel': 'Мы в соцсетях',
  'contacts.mapLoadingText': 'Карта загружается только по вашему запросу, чтобы не замедлять страницу.',
  'contacts.mapShowBtn': 'Показать карту',
  'contacts.mapRouteLink': 'Проложить маршрут',
  'contacts.mapIframeTitle': 'Карта: автомагазин TIRE PLACE, авторынок «Терминал», Кривой Рог',

  // --- faq ---
  'faq.eyebrow': 'Вопросы',
  'faq.heading': 'Частые вопросы',
  'faq.q1': 'Есть ли шины и диски в наличии?',
  'faq.q2': 'Как подобрать размер шин или дисков?',
  'faq.q3': 'Сколько длится шиномонтаж?',
  'faq.q4': 'Можно ли заказать диски под конкретный автомобиль?',
  'faq.q5': 'Где вас найти?',
  'faq.q6': 'Нужна ли предварительная запись на шиномонтаж?',
  'faq.q7': 'Какие аккумуляторы в продаже?',

  // --- footer ---
  'footer.rightsReserved': 'Все права защищены.',
  'footer.slogan': 'Твоё шинное пространство',

  // --- cart / checkout ---
  'cart.dialogAria': 'Корзина',
  'cart.heading': 'Корзина',
  'cart.closeAria': 'Закрыть корзину',
  'cart.empty': 'Корзина пуста',
  'cart.decreaseAria': 'Уменьшить количество',
  'cart.increaseAria': 'Увеличить количество',
  'cart.removeAria': 'Удалить товар',
  'cart.totalLabel': 'Итого',
  'cart.nameLabel': 'Имя',
  'cart.phoneLabel': 'Номер телефона',
  'cart.deliveryLegend': 'Способ доставки',
  'cart.pickup': 'Самовывоз из магазина',
  'cart.novaPoshta': 'Новая Почта',
  'cart.cityLabel': 'Город',
  'cart.branchLabel': 'Отделение или адрес',
  'cart.commentLabel': 'Комментарий (необязательно)',
  'cart.submitBtn': 'Оформить заказ',
  'cart.errorNamePhone': 'Укажите имя и номер телефона',
  'cart.errorNp': 'Укажите город и отделение или адрес Новой Почты',
  'cart.confirmMessage': 'Заказ принят, мы с вами свяжемся',
  'cart.orderToast': 'Заказ оформлен',
  'cart.orderErrorFallback': 'Не удалось оформить заказ',

  // --- a11y / misc ---
  'a11y.burgerOpen': 'Открыть меню',
  'a11y.phoneCall': 'Позвонить: +38 (098) 071-93-93',
  'a11y.skipLink': 'Перейти к основному контенту',
  'a11y.heroSliderAria': 'Фото автомагазина TIRE PLACE, Кривой Рог',
  'a11y.heroPrev': 'Предыдущее фото',
  'a11y.heroNext': 'Следующее фото',
  'a11y.heroPauseLabel': 'Пауза автопереключения слайдов',
  'a11y.heroPlayLabel': 'Возобновить автопереключение слайдов',
  'a11y.of': 'из',
  'a11y.logoHome': 'TIRE PLACE — на главную',
  'a11y.footerNavAria': 'Навигация в футере',
  'a11y.mainNavAria': 'Основная навигация',
  'a11y.telegramFloatingAria': 'Написать нам в Telegram',
  'a11y.langSwitchAria': 'Язык сайта',
  'a11y.heroDotsAria': 'Выбор слайда',
};
