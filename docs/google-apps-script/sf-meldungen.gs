/**
 * Salesforce-Meldungen – Apps-Script-Web-App für die Meldungs-Tabelle.
 *
 * Das Intranet (apps/api, routes/sf-issues.ts) schreibt hierüber neue Zeilen
 * und liest die eigenen Meldungen eines Consultants zurück.
 *
 * Einrichtung:
 * 1. Tabelle öffnen → Erweiterungen → Apps Script, diesen Code einfügen, speichern.
 * 2. Projekteinstellungen (Zahnrad) → Skripteigenschaften → Eigenschaft
 *    „TOKEN“ = langer Zufallswert (z. B. `openssl rand -hex 32`).
 * 3. Bereitstellen → Neue Bereitstellung → Typ „Web-App“,
 *    Ausführen als: Ich, Zugriff: Jeder → Bereitstellen, URL kopieren.
 * 4. In apps/api setzen: SF_SHEET_URL = die Web-App-URL, SF_SHEET_TOKEN = derselbe TOKEN.
 * Bei Code-Änderungen: Bereitstellungen verwalten → bestehende bearbeiten →
 * neue Version (sonst ändert sich die URL).
 *
 * Bewusst kein doGet: der Token steht nie in einer URL.
 */

var SHEET_NAME = "Tabellenblatt1";
var LIST_LIMIT = 50;

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "bad_request" });
  }
  var token = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!token || body.token !== token) return json_({ ok: false, error: "forbidden" });

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return json_({ ok: false, error: "sheet_missing" });

  if (body.action === "append") return json_(append_(sheet, body.row || {}));
  if (body.action === "list") return json_(list_(sheet, String(body.consultant || "")));
  return json_({ ok: false, error: "unknown_action" });
}

function append_(sheet, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var values = [
      row.datum,
      row.consultant,
      row.project,
      row.camId,
      row.firma,
      row.topic,
      row.beschreibung,
      "Open",
      row.info,
      row.sfLink,
    ].map(safe_);
    sheet.appendRow(values);
    return { ok: true, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function list_(sheet, consultant) {
  var name = consultant.trim().toLowerCase();
  if (!name) return { ok: true, items: [] };
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, items: [] };
  var data = sheet.getRange(2, 1, last - 1, 10).getDisplayValues();
  var items = [];
  for (var i = data.length - 1; i >= 0 && items.length < LIST_LIMIT; i--) {
    var r = data[i];
    if (String(r[1]).trim().toLowerCase() !== name) continue;
    items.push({
      row: i + 2,
      datum: r[0],
      project: r[2],
      camId: r[3],
      firma: r[4],
      topic: r[5],
      beschreibung: r[6],
      status: r[7],
      info: r[8],
      sfLink: r[9],
    });
  }
  return { ok: true, items: items };
}

/** Formel-Injection verhindern: = + - @ am Anfang mit ' entschärfen. */
function safe_(value) {
  var s = value == null ? "" : String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
