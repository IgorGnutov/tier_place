/**
 * Apps Script Web App для /admin сайту TIRE PLACE.
 *
 * Куди вставляти: Google Таблиця (та сама, де листи "Шини"/"Диски"/"Шиномонтаж") →
 * Розширення → Apps Script → вставити весь цей файл замість Code.gs.
 *
 * Одноразове налаштування:
 * 1. Створіть у таблиці лист з назвою "Контент" і заголовками в першому рядку: key, value.
 * 2. Project Settings (⚙) → Script Properties → додати властивість ADMIN_PASSWORD зі своїм паролем.
 * 3. Deploy → New deployment → тип "Web app":
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    Скопіюйте URL, що закінчується на /exec.
 * 4. Впишіть цей URL у CONTENT_API_URL в src/config.ts сайту.
 *
 * Детальніше — README.md, розділ "Адмінка: редагування текстових блоків".
 */

var CONTENT_SHEET_NAME = 'Контент';

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

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
