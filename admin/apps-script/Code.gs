/**
 * Apps Script Web App для /admin сайту TIRE PLACE.
 *
 * Куди вставляти: Google Таблиця (та сама, де листи "Шини"/"Диски"/"Шиномонтаж") →
 * Розширення → Apps Script → вставити весь цей файл замість Code.gs.
 *
 * Одноразове налаштування:
 * 1. Створіть у таблиці лист з назвою "Контент" і заголовками в першому рядку: key, value,
 *    value_ru (третя колонка — необов'язкова, з'являється сама при першому збереженні
 *    російського тексту через /admin).
 *    Листи "Замовлення" і "Відгуки" створюються автоматично при першому замовленні/відгуку —
 *    вручну створювати не треба. Але щоб відгуки почали з'являтись на сторінках товару, gid
 *    листа "Відгуки" треба один раз вписати в src/data/sheet-ids.json — див. README.md,
 *    розділ "Відгуки на товари".
 * 2. Project Settings (⚙) → Script Properties → додати властивості:
 *    - ADMIN_PASSWORD — пароль для входу в /admin
 *    - BOT_TOKEN — токен Telegram-бота (від @BotFather)
 *    - CHAT_ID — chat_id, куди бот надсилає повідомлення про нові замовлення й відгуки
 *    - GITHUB_TOKEN — fine-grained Personal Access Token з правом "Actions: write" лише на цей
 *      репозиторій (GitHub → Settings → Developer settings → Fine-grained tokens)
 *    - GITHUB_REPO — "власник/репозиторій", напр. "IgorGnutov/tire_place"
 * 3. Deploy → New deployment → тип "Web app":
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    Скопіюйте URL, що закінчується на /exec.
 * 4. Впишіть цей URL у CONTENT_API_URL в src/config.ts сайту.
 *
 * Детальніше — README.md, розділи "Адмінка: редагування текстових блоків" і "Кошик і замовлення".
 */

var CONTENT_SHEET_NAME = 'Контент';
var ORDERS_SHEET_NAME = 'Замовлення';
var ORDER_HEADERS = [
  'order_id',
  'timestamp',
  'status',
  'name',
  'phone',
  'delivery_method',
  'np_city',
  'np_branch',
  'comment',
  'items',
  'total',
];

var REVIEWS_SHEET_NAME = 'Відгуки';
var REVIEW_HEADERS = [
  'review_id',
  'timestamp',
  'status',
  'product_id',
  'product_title',
  'product_url',
  'author',
  'rating',
  'body',
];

var REVIEW_STATUS_NEW = 'Нове';
var REVIEW_STATUS_PUBLISHED = 'Опубліковано';
var REVIEW_STATUS_REJECTED = 'Відхилено';

var REVIEW_AUTHOR_MIN = 2;
var REVIEW_AUTHOR_MAX = 60;
var REVIEW_BODY_MIN = 10;
var REVIEW_BODY_MAX = 1000;
// Людина фізично не заповнить форму швидше — бот заповнює її миттєво.
var REVIEW_MIN_ELAPSED_MS = 3000;

/**
 * ДІАГНОСТИКА: запустити вручну (вибрати testAuth_ у списку функцій → ▶ Запустити), щоб
 * спровокувати вікно авторизації для дозволу script.external_request (UrlFetchApp). Прибрати
 * разом з іншими діагностичними шматками після знаходження причини.
 */
function testAuth() {
  var response = UrlFetchApp.fetch('https://api.telegram.org', { muteHttpExceptions: true });
  Logger.log('testAuth code: ' + response.getResponseCode());
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var action = payload.action;

  if (action === 'verify') {
    return jsonResponse({ ok: checkPassword_(payload.password) });
  }

  if (action === 'save') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    if (!payload.key) {
      return jsonResponse({ ok: false, error: 'Не вказано ключ блоку' });
    }
    saveContentValue_(payload.key, payload.html || '', payload.lang === 'ru' ? 'ru' : 'uk');
    return jsonResponse({ ok: true });
  }

  if (action === 'order') {
    return jsonResponse(createOrder_(payload));
  }

  // Публічна дія, як 'order': відгук може залишити будь-який відвідувач без авторизації.
  // Захист — валідація нижче плюс обов'язкова модерація: нічого не потрапляє на сайт,
  // доки власник не змінить статус на "Опубліковано" в /admin.
  if (action === 'review') {
    return jsonResponse(createReview_(payload));
  }

  if (action === 'listReviews') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse({ ok: true, reviews: listReviews_() });
  }

  if (action === 'moderateReview') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(moderateReview_(payload.reviewId, payload.status));
  }

  if (action === 'listOrders') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse({ ok: true, orders: listOrders_() });
  }

  if (action === 'updateOrderStatus') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(updateOrderStatus_(payload.orderId, payload.status));
  }

  if (action === 'hideOrder') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(hideOrder_(payload.orderId));
  }

  if (action === 'listArchivedOrders') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse({ ok: true, orders: listArchivedOrders_() });
  }

  if (action === 'restoreOrder') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(restoreOrder_(payload.orderId));
  }

  if (action === 'rebuildProducts') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(triggerRebuild_());
  }

  return jsonResponse({ ok: false, error: 'Невідома дія' });
}

function checkPassword_(password) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return !!expected && password === expected;
}

/**
 * Запускає вже наявний workflow_dispatch у .github/workflows/deploy.yml через GitHub REST API —
 * той самий job (npm run build + FTP-деплой), що інакше чекав би розкладу schedule.
 */
function triggerRebuild_() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var repo = PropertiesService.getScriptProperties().getProperty('GITHUB_REPO');
  if (!token || !repo) {
    return { ok: false, error: 'GITHUB_TOKEN або GITHUB_REPO не налаштовані в Script Properties' };
  }

  var url = 'https://api.github.com/repos/' + repo + '/actions/workflows/deploy.yml/dispatches';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
    },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 204) {
    return { ok: false, error: 'GitHub API повернув код ' + code + ': ' + response.getContentText() };
  }
  return { ok: true };
}

function saveContentValue_(key, html, lang) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONTENT_SHEET_NAME);
    sheet.appendRow(['key', 'value', 'value_ru']);
  }
  ensureContentHeaders_(sheet);

  var col = lang === 'ru' ? 3 : 2;
  var data = sheet.getDataRange().getValues();
  for (var row = 1; row < data.length; row++) {
    if (data[row][0] === key) {
      sheet.getRange(row + 1, col).setValue(html);
      return;
    }
  }

  var newRow = ['', '', ''];
  newRow[0] = key;
  newRow[col - 1] = html;
  sheet.appendRow(newRow);
}

/**
 * Старі таблиці могли створити лист "Контент" ще без третьої колонки value_ru — додаємо
 * заголовок, якщо його бракує, не чіпаючи наявні дані в A/B.
 */
function ensureContentHeaders_(sheet) {
  var header = sheet.getRange(1, 1, 1, 3).getValues()[0];
  if (header[0] !== 'key') sheet.getRange(1, 1).setValue('key');
  if (header[1] !== 'value') sheet.getRange(1, 2).setValue('value');
  if (header[2] !== 'value_ru') sheet.getRange(1, 3).setValue('value_ru');
}

function getOrCreateOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET_NAME);
    sheet.appendRow(ORDER_HEADERS);
  }
  return sheet;
}

function formatItemsText_(items) {
  if (!items || items.length === 0) return '—';
  return items
    .map(function (item, index) {
      var price = item.price === null || item.price === undefined ? null : Number(item.price);
      var qty = Number(item.qty) || 0;
      var priceText = price !== null ? price + ' грн' : 'ціна за запитом';
      var lineTotalText = price !== null ? price * qty + ' грн' : '—';
      return (
        (index + 1) + '. ' + item.title + ' (' + item.sizeLine + ') — ' + qty + ' шт. × ' + priceText + ' = ' + lineTotalText
      );
    })
    .join('\n');
}

/**
 * Google Таблиця трактує значення, що починається з =, +, - або @, як формулу. Дані замовлення
 * приходять з публічної дії 'order', тому перед записом додаємо апостроф — Sheets покаже такий
 * рядок як текст і нічого не виконає.
 */
function sanitizeCell_(value) {
  var str = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(str)) return "'" + str;
  return str;
}

/**
 * Порядковий номер замовлення (1, 2, 3, ...) замість випадкового мітки часу — зберігається
 * в Script Properties, а LockService захищає від перегону, якщо два замовлення прийдуть
 * одночасно.
 */
function getNextOrderNumber_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var current = parseInt(props.getProperty('NEXT_ORDER_NUM'), 10);
    if (isNaN(current) || current < 1) current = 1;
    props.setProperty('NEXT_ORDER_NUM', String(current + 1));
    return current;
  } finally {
    lock.releaseLock();
  }
}

function createOrder_(payload) {
  var sheet = getOrCreateOrdersSheet_();
  var orderId = 'ORD-' + getNextOrderNumber_();
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var itemsText = formatItemsText_(payload.items);
  var total = Number(payload.total) || 0;
  var deliveryMethod = payload.deliveryMethod === 'np' ? 'Нова Пошта' : 'Самовивіз';

  // orderId/timestamp/status/total генерує сервер — їх екранувати не треба, решта приходить від клієнта.
  sheet.appendRow([
    orderId,
    timestamp,
    'Нове',
    sanitizeCell_(payload.name),
    sanitizeCell_(payload.phone),
    deliveryMethod,
    sanitizeCell_(payload.npCity),
    sanitizeCell_(payload.npBranch),
    sanitizeCell_(payload.comment),
    sanitizeCell_(itemsText),
    total,
  ]);

  try {
    sendTelegramOrderNotification_(orderId, timestamp, payload, deliveryMethod, itemsText, total);
  } catch (err) {
    // Замовлення вже записане в таблицю — збій сповіщення в Telegram не повинен ламати відповідь користувачу.
    logTelegramDebug_(orderId, 'Виняток: ' + err);
  }

  return { ok: true, orderId: orderId };
}

/**
 * ДІАГНОСТИКА: тимчасовий запис у лист "TelegramDebug" — Logger.log/Cloud Logging для цього
 * проєкту не показує виконання (Executions → doPost → "Для цього завдання немає журналів"),
 * тому пишемо результат прямо в таблицю, яку точно видно. Прибрати після знаходження причини.
 */
function logTelegramDebug_(orderId, message) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TelegramDebug');
  if (!sheet) {
    sheet = ss.insertSheet('TelegramDebug');
    sheet.appendRow(['timestamp', 'orderId', 'message']);
  }
  sheet.appendRow([new Date(), orderId, message]);
}

function sendTelegramOrderNotification_(orderId, timestamp, payload, deliveryMethod, itemsText, total) {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var chatId = PropertiesService.getScriptProperties().getProperty('CHAT_ID');
  if (!token || !chatId) {
    logTelegramDebug_(orderId, 'Пропущено: BOT_TOKEN=' + (token ? 'є' : 'НЕМАЄ') + ', CHAT_ID=' + (chatId ? 'є' : 'НЕМАЄ'));
    return;
  }

  var deliveryLine =
    deliveryMethod === 'Нова Пошта'
      ? 'Нова Пошта, ' + (payload.npCity || '') + ', ' + (payload.npBranch || '')
      : 'Самовивіз з магазину';

  var phone = payload.phone || '';
  var phoneLine = 'Телефон: ' + escapeHtml_(phone);

  var lines = [
    '🛒 Нове замовлення ' + escapeHtml_(orderId),
    escapeHtml_(timestamp),
    "Ім'я: " + escapeHtml_(payload.name || ''),
    phoneLine,
    'Доставка: ' + escapeHtml_(deliveryLine),
  ];
  if (payload.comment) lines.push('Коментар: ' + escapeHtml_(payload.comment));
  lines.push('');
  lines.push(escapeHtml_(itemsText));
  lines.push('');
  lines.push('Разом: ' + escapeHtml_(String(total)) + ' грн');

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
    muteHttpExceptions: true,
  });
  logTelegramDebug_(orderId, 'HTTP ' + response.getResponseCode() + ': ' + response.getContentText());
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getOrCreateReviewsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REVIEWS_SHEET_NAME);
    sheet.appendRow(REVIEW_HEADERS);
  }
  return sheet;
}

function getNextReviewNumber_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var current = parseInt(props.getProperty('NEXT_REVIEW_NUM'), 10);
    if (isNaN(current) || current < 1) current = 1;
    props.setProperty('NEXT_REVIEW_NUM', String(current + 1));
    return current;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Валідація відгуку. Дзеркалить перевірки в src/js/reviews.ts — але саме серверна є справжньою:
 * клієнтську можна обійти запитом напряму на цей Web App.
 */
function validateReview_(payload) {
  if (!payload.productId || String(payload.productId).trim() === '') {
    return 'Не вказано товар';
  }
  // Honeypot: поле сховане CSS-ом, людина його не бачить і не заповнить.
  if (payload.website && String(payload.website).trim() !== '') {
    return 'Не вдалося зберегти відгук';
  }
  var elapsed = Number(payload.elapsedMs);
  if (!isFinite(elapsed) || elapsed < REVIEW_MIN_ELAPSED_MS) {
    return 'Не вдалося зберегти відгук';
  }

  var rating = Number(payload.rating);
  if (!isFinite(rating) || rating !== Math.floor(rating) || rating < 1 || rating > 5) {
    return 'Оцінка має бути від 1 до 5';
  }

  var author = String(payload.author == null ? '' : payload.author).trim();
  if (author.length < REVIEW_AUTHOR_MIN || author.length > REVIEW_AUTHOR_MAX) {
    return "Ім'я має бути від " + REVIEW_AUTHOR_MIN + ' до ' + REVIEW_AUTHOR_MAX + ' символів';
  }

  var body = String(payload.body == null ? '' : payload.body).trim();
  if (body.length < REVIEW_BODY_MIN || body.length > REVIEW_BODY_MAX) {
    return 'Відгук має бути від ' + REVIEW_BODY_MIN + ' до ' + REVIEW_BODY_MAX + ' символів';
  }

  return null;
}

function createReview_(payload) {
  var invalid = validateReview_(payload);
  if (invalid) {
    return { ok: false, error: invalid };
  }

  var sheet = getOrCreateReviewsSheet_();
  var reviewId = 'REV-' + getNextReviewNumber_();
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var rating = Number(payload.rating);

  // reviewId/timestamp/status/rating генерує або нормалізує сервер, решта приходить від клієнта.
  // Апостроф перед timestamp примусово робить комірку текстовою: інакше Sheets перетворює її на
  // справжній Date і CSV-експорт віддає локалізований формат, який білд не розбере як ISO-дату.
  sheet.appendRow([
    reviewId,
    "'" + timestamp,
    REVIEW_STATUS_NEW,
    sanitizeCell_(String(payload.productId).trim()),
    sanitizeCell_(payload.productTitle),
    sanitizeCell_(payload.productUrl),
    sanitizeCell_(String(payload.author).trim()),
    rating,
    sanitizeCell_(String(payload.body).trim()),
  ]);

  try {
    sendTelegramReviewNotification_(reviewId, timestamp, payload, rating);
  } catch (err) {
    // Відгук уже в таблиці. Якби ця помилка дійшла до користувача, він відправив би відгук
    // ще раз і засмітив чергу модерації дублем — тому ковтаємо її, як і для замовлень.
    logTelegramDebug_(reviewId, 'Виняток: ' + err);
  }

  return { ok: true, reviewId: reviewId };
}

function ratingStars_(rating) {
  var stars = '';
  for (var i = 1; i <= 5; i++) stars += i <= rating ? '★' : '☆';
  return stars;
}

function sendTelegramReviewNotification_(reviewId, timestamp, payload, rating) {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var chatId = PropertiesService.getScriptProperties().getProperty('CHAT_ID');
  if (!token || !chatId) {
    logTelegramDebug_(reviewId, 'Пропущено: BOT_TOKEN=' + (token ? 'є' : 'НЕМАЄ') + ', CHAT_ID=' + (chatId ? 'є' : 'НЕМАЄ'));
    return;
  }

  // parse_mode: 'HTML' — тому кожне значення від клієнта обов'язково через escapeHtml_.
  // Текст відгуку це довільний ввід, і "<" у ньому ("шум < ніж на попередніх") без екранування
  // дасть Telegram 400 can't parse entities, а сповіщення тихо зникне.
  var lines = [
    '⭐ Новий відгук ' + escapeHtml_(reviewId),
    escapeHtml_(timestamp),
    'Товар: ' + escapeHtml_(payload.productTitle || payload.productId || ''),
    'Оцінка: ' + ratingStars_(rating) + ' (' + rating + '/5)',
    'Автор: ' + escapeHtml_(payload.author || ''),
    '',
    escapeHtml_(payload.body || ''),
    '',
    'Треба схвалити в /admin → Відгуки',
  ];

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
    muteHttpExceptions: true,
  });
  logTelegramDebug_(reviewId, 'HTTP ' + response.getResponseCode() + ': ' + response.getContentText());
}

function listReviews_() {
  var sheet = getOrCreateReviewsSheet_();
  var data = sheet.getDataRange().getValues();
  var reviews = [];
  for (var row = 1; row < data.length; row++) {
    var r = data[row];
    if (!r[0]) continue;
    // Навіть з апострофом при записі стара таблиця могла зберегти дату як Date —
    // приводимо до одного формату, як readAllOrders_.
    var rawTimestamp = r[1];
    var timestamp =
      rawTimestamp instanceof Date
        ? Utilities.formatDate(rawTimestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : String(rawTimestamp);
    reviews.push({
      reviewId: r[0],
      timestamp: timestamp,
      status: r[2],
      productId: r[3],
      productTitle: r[4],
      productUrl: r[5],
      author: r[6],
      rating: r[7],
      body: r[8],
    });
  }
  return reviews;
}

/**
 * Модерація лише змінює статус — рядок з таблиці не видаляється ніколи, так само як
 * приховування замовлень не чіпає їхні рядки.
 */
function moderateReview_(reviewId, status) {
  if (status !== REVIEW_STATUS_PUBLISHED && status !== REVIEW_STATUS_REJECTED) {
    return { ok: false, error: 'Некоректний статус' };
  }
  if (!reviewId) {
    return { ok: false, error: 'Не вказано ID відгуку' };
  }
  var sheet = getOrCreateReviewsSheet_();
  var data = sheet.getDataRange().getValues();
  for (var row = 1; row < data.length; row++) {
    if (data[row][0] === reviewId) {
      sheet.getRange(row + 1, 3).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Відгук не знайдено' };
}

/**
 * Список ID замовлень, прихованих в адмінці. Приховування не чіпає рядок у таблиці —
 * список ID зберігається окремо в Script Properties, тому дані замовлення завжди
 * лишаються в Google Таблиці.
 */
function getHiddenOrderIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('HIDDEN_ORDER_IDS');
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function setHiddenOrderIds_(ids) {
  PropertiesService.getScriptProperties().setProperty('HIDDEN_ORDER_IDS', JSON.stringify(ids));
}

function hideOrder_(orderId) {
  if (!orderId) {
    return { ok: false, error: 'Не вказано ID замовлення' };
  }
  var hidden = getHiddenOrderIds_();
  if (hidden.indexOf(orderId) === -1) {
    hidden.push(orderId);
    setHiddenOrderIds_(hidden);
  }
  return { ok: true };
}

function restoreOrder_(orderId) {
  if (!orderId) {
    return { ok: false, error: 'Не вказано ID замовлення' };
  }
  var hidden = getHiddenOrderIds_();
  var index = hidden.indexOf(orderId);
  if (index !== -1) {
    hidden.splice(index, 1);
    setHiddenOrderIds_(hidden);
  }
  return { ok: true };
}

function readAllOrders_() {
  var sheet = getOrCreateOrdersSheet_();
  var data = sheet.getDataRange().getValues();
  var orders = [];
  for (var row = 1; row < data.length; row++) {
    var r = data[row];
    if (!r[0]) continue;
    // Sheets може сама перетворити рядок дати на справжній Date — приводимо до одного
    // локального формату, щоб /admin показував час однаково незалежно від типу комірки.
    var rawTimestamp = r[1];
    var timestamp =
      rawTimestamp instanceof Date
        ? Utilities.formatDate(rawTimestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : rawTimestamp;
    orders.push({
      orderId: r[0],
      timestamp: timestamp,
      status: r[2],
      name: r[3],
      phone: r[4],
      deliveryMethod: r[5],
      npCity: r[6],
      npBranch: r[7],
      comment: r[8],
      items: r[9],
      total: r[10],
    });
  }
  return orders;
}

function listOrders_() {
  var hidden = getHiddenOrderIds_();
  return readAllOrders_().filter(function (order) {
    return hidden.indexOf(order.orderId) === -1;
  });
}

function listArchivedOrders_() {
  var hidden = getHiddenOrderIds_();
  return readAllOrders_().filter(function (order) {
    return hidden.indexOf(order.orderId) !== -1;
  });
}

function updateOrderStatus_(orderId, status) {
  if (status !== 'Нове' && status !== 'Опрацьовано') {
    return { ok: false, error: 'Некоректний статус' };
  }
  var sheet = getOrCreateOrdersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var row = 1; row < data.length; row++) {
    if (data[row][0] === orderId) {
      sheet.getRange(row + 1, 3).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Замовлення не знайдено' };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
