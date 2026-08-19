Using Below Code create code.gs file for above generated js code

/**
 * ROAR Event Pass Registration — Google Apps Script backend
 * -------------------------------------------------------
 * SETUP
 * 1. Create a new Google Sheet, name it e.g. "ROAR Registrations".
 * 2. Extensions > Apps Script. Delete any starter code and paste this file in.
 * 3. Update SHEET_NAME below if you used a different tab name (default tab is "Sheet1").
 * 4. Update EVENT_DATE_TEXT / EVENT_VENUE_TEXT once confirmed.
 * 5. Click Deploy > New deployment > select type "Web app".
 *      - Description: ROAR registration endpoint
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Copy the Web App URL and paste it into APPS_SCRIPT_URL in register.js.
 * 7. Re-deploy (Deploy > Manage deployments > Edit > New version) any time you change this file.
 *
 * PHOTOS
 * - The passport photo is sent as base64 and saved as a file in a Google Drive
 *   folder named by PHOTO_FOLDER_NAME (created automatically on first run).
 * - Only the Drive file link is stored in the sheet — photos are never pasted
 *   into cells directly, since Sheets cells cap out at 50,000 characters.
 *
 * REGISTRATION IDs
 * - IDs are generated server-side as ROAR-2026-0001, 0002, ... based on how many
 *   rows already exist, guarded by a script lock so two submissions arriving at
 *   the same moment can't collide.
 *
 * EMAIL
 * - Confirmation emails send via MailApp (Guild's Gmail quota: 100/day on a free
 *   account). A failure here never blocks the registration itself.
 */

const SHEET_NAME = "Sheet1";
const PHOTO_FOLDER_NAME = "ROAR 2026 - Registration Photos";
const EVENT_DATE_TEXT = "To Be Announced";
const EVENT_VENUE_TEXT = "Dharmapala Vidyalaya Main Hall, Pannipitiya";
const ORGANIZER_EMAIL = "prefectsguild@dharmapalapannipitiya.lk";
const LOGO_IMAGE_URL = ""; // optional: paste a public image URL to show the real crest in emails

const HEADERS = [
  "Timestamp", "Registration ID",
  "Full Name", "Preferred Name", "Date of Birth", "Gender",
  "Category",
  "School Name", "Grade",
  "Batch", "Position", "Camp Access",
  "Mobile", "WhatsApp", "Email",
  "Photo URL",
  "Emergency Name", "Emergency Mobile", "Emergency Relation",
  "Confirmed Accurate", "Agreed to Rules"
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sheet;
}

function getPhotoFolder_() {
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

/** Saves the base64 photo to Drive and returns a viewable URL, or "" on failure. */
function savePhoto_(regId, photoBase64, photoMime, photoName) {
  if (!photoBase64) return "";
  try {
    const bytes = Utilities.base64Decode(photoBase64);
    const mime = photoMime || "image/jpeg";
    const safeName = (regId || "roar") + "_" + (photoName || "photo.jpg");
    const blob = Utilities.newBlob(bytes, mime, safeName);
    const file = getPhotoFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/uc?export=view&id=" + file.getId();
  } catch (err) {
    console.error("Photo upload failed: " + err.message);
    return "";
  }
}

/** Generates the next sequential ROAR-2026-XXXX ID, guarded by a lock. */
function nextRegId_(sheet) {
  const dataRows = Math.max(sheet.getLastRow() - 1, 0); // minus header row
  const num = dataRows + 1;
  return "ROAR-2026-" + Utilities.formatString("%04d", num);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet_();
    const regId = nextRegId_(sheet);

    const photoUrl = savePhoto_(regId, data.photoBase64, data.photoMime, data.photoName);

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      regId,
      data.fullName || "",
      data.preferredName || "",
      data.dob || "",
      data.gender || "",
      data.category || "",
      data.schoolName || "",
      data.grade || "",
      data.batch || "",
      data.position || "",
      data.campAccess === true || data.campAccess === "true" ? "Yes" : "No",
      data.mobile || "",
      data.whatsapp || "",
      data.email || "",
      photoUrl,
      data.emergencyName || "",
      data.emergencyMobile || "",
      data.emergencyRelation || "",
      data.confirmAccurate ? "Yes" : "No",
      data.agreeRules ? "Yes" : "No"
    ]);

    // Email delivery is best-effort: a failure here must never break registration.
    try {
      sendConfirmationEmail_(data, regId, photoUrl);
    } catch (mailErr) {
      console.error("Confirmation email failed: " + mailErr.message);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", regId: regId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ROAR registration endpoint is live" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sends a ROAR-themed HTML confirmation email to the registrant.
 * Uses a table-based layout with inline styles since most email
 * clients (Gmail, Outlook) strip <style> blocks and external CSS.
 */
function sendConfirmationEmail_(data, regId, photoUrl) {
  const email = (data.email || "").trim();
  if (!email || email.indexOf("@") === -1) return; // nothing to send to

  const name = data.preferredName || data.fullName || "Guest";
  const category = data.category || "Guest";
  const qrPayload = encodeURIComponent(regId + " | " + (data.fullName || "") + " | " + category);
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=" + qrPayload;

  const logoBlock = LOGO_IMAGE_URL
    ? '<img src="' + LOGO_IMAGE_URL + '" alt="ROAR" width="64" style="display:block;margin:0 auto 14px;">'
    : '';

  const photoBlock = photoUrl
    ? '<img src="' + photoUrl + '" width="90" height="90" alt="Your photo" style="border-radius:50%;object-fit:cover;border:2px solid #D4AF37;display:block;margin:0 auto 18px;">'
    : '';

  const htmlBody = '' +
'<div style="background:#050505;padding:36px 16px;font-family:Georgia,\'Times New Roman\',serif;">' +
  '<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;background:#0d0c0a;border:1px solid #D4AF37;border-radius:10px;overflow:hidden;">' +

    '<tr><td style="background:linear-gradient(135deg,#5C0A1D,#2a0510);padding:34px 30px;text-align:center;border-bottom:2px solid #D4AF37;">' +
      logoBlock +
      '<div style="font-family:Georgia,serif;font-weight:bold;font-size:34px;letter-spacing:6px;color:#F5D76E;">ROAR</div>' +
      '<div style="font-size:11px;letter-spacing:3px;color:#D4AF37;text-transform:uppercase;margin-top:6px;">Annual Prefects&#39; Day &middot; Dharmapala Vidyalaya, Pannipitiya</div>' +
    '</td></tr>' +

    '<tr><td style="padding:34px 30px;color:#F5F5F5;">' +
      '<p style="font-size:13px;letter-spacing:2px;color:#D4AF37;text-transform:uppercase;margin:0 0 8px;text-align:center;">✅ Registration Successful</p>' +
      photoBlock +
      '<h1 style="font-size:22px;margin:0 0 18px;color:#ffffff;text-align:center;">You&#39;re on the list, ' + escapeHtml_(name) + '.</h1>' +
      '<p style="font-size:14px;line-height:1.7;color:#cfcfcf;margin:0 0 26px;text-align:center;">Your event pass has been recorded. Keep this email or a screenshot of the QR code below &mdash; it&#39;s your entry pass on the day.</p>' +

      '<table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:26px;">' +
        detailRow_("Registration ID", regId) +
        detailRow_("Category", category) +
        detailRow_("Name", data.fullName || "") +
        detailRow_("Date", EVENT_DATE_TEXT) +
        detailRow_("Venue", EVENT_VENUE_TEXT) +
      '</table>' +

      '<div style="text-align:center;background:#ffffff;border-radius:10px;padding:20px;margin-bottom:26px;">' +
        '<img src="' + qrUrl + '" width="200" height="200" alt="Your ROAR QR pass" style="display:block;margin:0 auto;">' +
      '</div>' +

      '<p style="font-size:12.5px;line-height:1.7;color:#9c9c9c;margin:0;text-align:center;">Your event pass will be verified by the organizing committee. You will receive further instructions via email or WhatsApp.</p>' +
    '</td></tr>' +

    '<tr><td style="padding:22px 30px;background:#000000;text-align:center;border-top:1px solid #3a2a10;">' +
      '<p style="font-size:11px;letter-spacing:1px;color:#8a8a8a;margin:0;">Prefects&#39; Guild, Dharmapala Vidyalaya Pannipitiya &middot; ' + ORGANIZER_EMAIL + '</p>' +
    '</td></tr>' +

  '</table>' +
'</div>';

  const plainBody =
    "ROAR — Registration Successful\n\n" +
    "Hi " + name + ",\n\n" +
    "Your ROAR 2026 event pass registration has been recorded.\n\n" +
    "Registration ID: " + regId + "\n" +
    "Category: " + category + "\n" +
    "Name: " + (data.fullName || "") + "\n" +
    "Date: " + EVENT_DATE_TEXT + "\n" +
    "Venue: " + EVENT_VENUE_TEXT + "\n\n" +
    "Your QR entry pass: " + qrUrl + "\n\n" +
    "Your event pass will be verified by the organizing committee. You will receive further instructions via email or WhatsApp.\n\n" +
    "— Prefects' Guild, Dharmapala Vidyalaya Pannipitiya";

  MailApp.sendEmail({
    to: email,
    subject: "ROAR 2026 — Registration Successful (" + regId + ")",
    body: plainBody,
    htmlBody: htmlBody,
    name: "Prefects' Guild — ROAR 2026"
  });
}

function detailRow_(label, value) {
  return '<tr>' +
    '<td style="padding:9px 0;font-size:12px;letter-spacing:1px;color:#D4AF37;text-transform:uppercase;border-bottom:1px solid #241a10;width:40%;">' + escapeHtml_(label) + '</td>' +
    '<td style="padding:9px 0;font-size:14px;color:#F5F5F5;border-bottom:1px solid #241a10;text-align:right;">' + escapeHtml_(String(value)) + '</td>' +
  '</tr>';
}

function escapeHtml_(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
