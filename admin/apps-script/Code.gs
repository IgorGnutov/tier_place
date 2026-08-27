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

function createOrder_(payload) {
  var sheet = getOrCreateOrdersSheet_();
  var orderId = 'ORD-' + new Date().getTime();
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
    Logger.log('Telegram notification failed: ' + err);
  }

  return { ok: true, orderId: orderId };
}

function sendTelegramOrderNotification_(orderId, timestamp, payload, deliveryMethod, itemsText, total) {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var chatId = PropertiesService.getScriptProperties().getProperty('CHAT_ID');
  if (!token || !chatId) return;

  var deliveryLine =
    deliveryMethod === 'Нова Пошта'
      ? 'Нова Пошта, ' + (payload.npCity || '') + ', ' + (payload.npBranch || '')
      : 'Самовивіз з магазину';

  var lines = [
    '🛒 Нове замовлення ' + orderId,
    timestamp,
    "Ім'я: " + (payload.name || ''),
    'Телефон: ' + (payload.phone || ''),
    'Доставка: ' + deliveryLine,
  ];
  if (payload.comment) lines.push('Коментар: ' + payload.comment);
  lines.push('');
  lines.push(itemsText);
  lines.push('');
  lines.push('Разом: ' + total + ' грн');

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: lines.join('\n') }),
    muteHttpExceptions: true,
  });
}

function listOrders_() {
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
