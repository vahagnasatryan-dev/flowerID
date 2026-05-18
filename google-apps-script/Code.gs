const SHEET_HEADERS = {
  events: [
    "received_at",
    "created_at",
    "session_id",
    "event_id",
    "event_name",
    "step",
    "progress",
    "source",
    "request_id",
    "submission_id",
    "payload_json",
  ],
  submissions: [
    "received_at",
    "submission_id",
    "created_at",
    "session_id",
    "source",
    "referrer_id",
    "request_id",
    "name",
    "telegram",
    "phone",
    "primary_archetype",
    "secondary_archetype",
    "title",
    "mood",
    "favorite_palettes",
    "ideal_palette",
    "rejected_palettes",
    "favorite_flowers",
    "avoid_flowers",
    "fragrance",
    "longevity",
    "allergies_kind",
    "allergies_comment",
    "packaging",
    "packaging_stoplist",
    "personal_note",
    "florist_brief",
    "payload_json",
  ],
  requests: [
    "received_at",
    "request_id",
    "created_at",
    "session_id",
    "requester_name",
    "recipient_name",
    "occasion",
    "status",
    "submission_id",
    "opened_at",
    "started_at",
    "completed_at",
    "comment",
    "payload_json",
  ],
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const records = Array.isArray(body.records) ? body.records : [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const receivedAt = new Date().toISOString();

    records.forEach((record) => {
      if (record.kind === "event") appendEvent(ss, record, receivedAt);
      if (record.kind === "submission") appendSubmission(ss, record, receivedAt);
      if (record.kind === "request") appendRequest(ss, record, receivedAt);
    });

    return jsonResponse({ ok: true, inserted: records.length });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_HEADERS).forEach((name) => getSheet(ss, name));
  return jsonResponse({
    ok: true,
    service: "flower_id_collector",
    setup: true,
    spreadsheet: ss.getUrl(),
    sheets: Object.keys(SHEET_HEADERS),
  });
}

function appendEvent(ss, record, receivedAt) {
  const sheet = getSheet(ss, "events");
  const payload = record.payload || {};
  const eventPayload = payload.event_payload || {};
  sheet.appendRow([
    receivedAt,
    payload.created_at || record.created_at || "",
    record.session_id || payload.session_id || "",
    payload.id || record.id || "",
    payload.event_name || "",
    eventPayload.step || "",
    eventPayload.progress || "",
    eventPayload.source || "",
    eventPayload.requestId || eventPayload.request_id || "",
    eventPayload.submissionId || eventPayload.submission_id || "",
    JSON.stringify(eventPayload),
  ]);
}

function appendSubmission(ss, record, receivedAt) {
  const sheet = getSheet(ss, "submissions");
  const payload = record.payload || {};
  const answers = payload.answers || {};
  const profile = payload.computed_profile || {};
  sheet.appendRow([
    receivedAt,
    payload.id || "",
    payload.created_at || "",
    record.session_id || "",
    payload.source || "",
    payload.referrer_id || "",
    payload.request_id || "",
    value(answers.user, "name"),
    value(answers.user, "telegram"),
    value(answers.user, "phone"),
    profile.primary_archetype || "",
    profile.secondary_archetype || "",
    profile.title || "",
    join(answers.mood),
    join(answers.favorite_palettes),
    answers.ideal_palette || "",
    join(answers.rejected_palettes),
    join(profile.favorite_flowers),
    join(profile.avoid_flowers),
    answers.fragrance || "",
    answers.longevity || "",
    value(answers.allergies, "kind"),
    value(answers.allergies, "comment"),
    join(answers.packaging),
    join(answers.packaging_stoplist),
    answers.personal_note || "",
    profile.florist_brief || "",
    JSON.stringify(payload),
  ]);
}

function appendRequest(ss, record, receivedAt) {
  const sheet = getSheet(ss, "requests");
  const payload = record.payload || {};
  sheet.appendRow([
    receivedAt,
    payload.id || "",
    payload.created_at || "",
    record.session_id || "",
    payload.requesterName || "",
    payload.recipientName || "",
    payload.occasion || "",
    payload.status || "",
    payload.submissionId || "",
    payload.opened_at || "",
    payload.started_at || "",
    payload.completed_at || "",
    payload.comment || "",
    JSON.stringify(payload),
  ]);
}

function getSheet(ss, name) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const headers = SHEET_HEADERS[name];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function join(value) {
  return Array.isArray(value) ? value.join("; ") : "";
}

function value(object, key) {
  return object && object[key] ? object[key] : "";
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
