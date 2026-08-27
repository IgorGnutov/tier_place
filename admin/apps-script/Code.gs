/**
 * Apps Script Web App для /admin сайту TIRE PLACE.
 *
 * Куди вставляти: Google Таблиця (та сама, де листи "Шини"/"Диски"/"Шиномонтаж") →
 * Розширення → Apps Script → вставити весь цей файл замість Code.gs.
 *
 * Одноразове налаштування:
 * 1. Створіть у таблиці лист з назвою "Контент" і заголовками в першому рядку: key, value.
 *    Лист "Замовлення" створюється автоматично при першому замовленні — вручну створювати не треба.
 * 2. Project Settings (⚙) → Script Properties → додати властивості:
 *    - ADMIN_PASSWORD — пароль для входу в /admin
 *    - BOT_TOKEN — токен Telegram-бота (від @BotFather)
 *    - CHAT_ID — chat_id, куди бот надсилає повідомлення про нові замовлення
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
    saveContentValue_(payload.key, payload.html || '');
    return jsonResponse({ ok: true });
  }

  if (action === 'order') {
    return jsonResponse(createOrder_(payload));
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

  return jsonResponse({ ok: false, error: 'Невідома дія' });
}

function checkPassword_(password) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return !!expected && password === expected;
}

function saveContentValue_(key, html) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONTENT_SHEET_NAME);
    sheet.appendRow(['key', 'value']);
  }

  var data = sheet.getDataRange().getValues();
  for (var row = 1; row < data.length; row++) {
    if (data[row][0] === key) {
      sheet.getRange(row + 1, 2).setValue(html);
      return;
    }
  }

  sheet.appendRow([key, html]);
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
  var phoneLine = phone ? 'Телефон: <a href="tel:' + escapeHtml_(phoneToTelHref_(phone)) + '">' + escapeHtml_(phone) + '</a>' : 'Телефон: ';

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

/**
 * Готує номер телефону для tel:-посилання: лишає лише цифри та початковий +, а український
 * номер, введений без коду країни (0XXXXXXXXX), доповнює до +380XXXXXXXXX.
 */
function phoneToTelHref_(phone) {
  var digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.charAt(0) === '+') {
    return digits;
  }
  if (digits.length === 10 && digits.charAt(0) === '0') {
    return '+38' + digits;
  }
  return '+' + digits;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
