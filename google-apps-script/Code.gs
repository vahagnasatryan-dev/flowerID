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
    "updated_at",
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
  feedback: [
    "received_at",
    "feedback_id",
    "created_at",
    "session_id",
    "submission_id",
    "archetype",
    "view",
    "phase",
    "value",
    "comment",
    "payload_json",
  ],
  orders: [
    "received_at",
    "order_id",
    "created_at",
    "session_id",
    "submission_id",
    "request_id",
    "flower_id",
    "recipient_name",
    "archetype",
    "budget",
    "occasion",
    "delivery_date",
    "delivery_details",
    "sender_name",
    "sender_contact",
    "comment",
    "source",
    "status",
    "message",
    "payload_json",
  ],
  gift_requests: [
    "received_at",
    "gift_request_id",
    "created_at",
    "updated_at",
    "session_id",
    "recipient_type",
    "recipient_custom",
    "occasion",
    "occasion_custom",
    "desired_effect",
    "desired_effect_custom",
    "taste_knowledge",
    "flower_id_link",
    "taste_note",
    "taste_style_hint",
    "taste_palette_hint",
    "taste_format_hint",
    "avoid_items",
    "budget",
    "recommended_style",
    "selected_option",
    "selected_card_text",
    "postcard_text",
    "telegram_clicked",
    "source",
    "status",
    "last_step",
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
    const seenInBatch = {};
    let inserted = 0;
    let skipped = 0;

    records.forEach((record) => {
      if (!record || !record.id || seenInBatch[record.id] || isProcessedRecord(record.id)) {
        skipped += 1;
        return;
      }

      seenInBatch[record.id] = true;
      if (record.kind === "event") {
        appendEvent(ss, record, receivedAt);
        markProcessedRecord(record.id);
        inserted += 1;
      }
      if (record.kind === "submission") {
        appendSubmission(ss, record, receivedAt);
        markProcessedRecord(record.id);
        inserted += 1;
      }
      if (record.kind === "request") {
        appendRequest(ss, record, receivedAt);
        markProcessedRecord(record.id);
        inserted += 1;
      }
      if (record.kind === "feedback") {
        appendFeedback(ss, record, receivedAt);
        markProcessedRecord(record.id);
        inserted += 1;
      }
      if (record.kind === "order") {
        appendOrder(ss, record, receivedAt);
        markProcessedRecord(record.id);
        inserted += 1;
      }
      if (record.kind === "gift_request") {
        appendGiftRequest(ss, record, receivedAt);
        markProcessedRecord(record.id);
        inserted += 1;
      }
    });

    return jsonResponse({ ok: true, inserted, skipped });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_HEADERS).forEach((name) => getSheet(ss, name));
  const params = (e && e.parameter) || {};

  if (params.action === "get_request" && params.request_id) {
    return apiResponse(
      {
        ok: true,
        request: findLatestRequest(ss, params.request_id),
        submission: findLatestSubmissionByRequest(ss, params.request_id),
      },
      params.callback,
    );
  }

  return apiResponse({
    ok: true,
    service: "flower_id_collector",
    setup: true,
    spreadsheet: ss.getUrl(),
    sheets: Object.keys(SHEET_HEADERS),
  }, params.callback);
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
  if (payload.event_name === "result_feedback_clicked" || payload.event_name === "result_feedback_submitted") {
    appendFeedbackFromEvent(ss, record, payload, eventPayload, receivedAt);
  }
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
    payload.updated_at || "",
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

function appendFeedback(ss, record, receivedAt) {
  const sheet = getSheet(ss, "feedback");
  const payload = record.payload || {};
  sheet.appendRow([
    receivedAt,
    payload.id || record.id || "",
    payload.created_at || record.created_at || "",
    record.session_id || "",
    payload.submissionId || payload.submission_id || "",
    payload.archetype || "",
    payload.view || "",
    payload.phase || "",
    payload.value || "",
    payload.comment || "",
    JSON.stringify(payload),
  ]);
}

function appendFeedbackFromEvent(ss, record, payload, eventPayload, receivedAt) {
  const sheet = getSheet(ss, "feedback");
  sheet.appendRow([
    receivedAt,
    payload.id || record.id || "",
    payload.created_at || record.created_at || "",
    record.session_id || payload.session_id || "",
    eventPayload.submissionId || eventPayload.submission_id || "",
    eventPayload.archetype || "",
    eventPayload.view || "",
    payload.event_name === "result_feedback_submitted" ? "submitted" : "clicked",
    eventPayload.value || "",
    eventPayload.comment || "",
    JSON.stringify(eventPayload),
  ]);
}

function appendOrder(ss, record, receivedAt) {
  const sheet = getSheet(ss, "orders");
  const payload = record.payload || {};
  sheet.appendRow([
    receivedAt,
    payload.id || record.id || "",
    payload.created_at || record.created_at || "",
    record.session_id || "",
    payload.submissionId || payload.submission_id || "",
    payload.requestId || payload.request_id || "",
    payload.flowerId || payload.flower_id || "",
    payload.recipientName || payload.recipient_name || "",
    payload.archetype || "",
    payload.budget || "",
    payload.occasion || "",
    payload.deliveryDate || payload.delivery_date || "",
    payload.deliveryDetails || payload.delivery_details || "",
    payload.senderName || payload.sender_name || "",
    payload.senderContact || payload.sender_contact || "",
    payload.comment || "",
    payload.source || "",
    payload.status || "",
    payload.message || "",
    JSON.stringify(payload),
  ]);
}

function appendGiftRequest(ss, record, receivedAt) {
  const sheet = getSheet(ss, "gift_requests");
  const payload = record.payload || {};
  sheet.appendRow([
    receivedAt,
    payload.id || record.id || "",
    payload.created_at || record.created_at || "",
    payload.updated_at || "",
    payload.session_id || record.session_id || "",
    payload.recipient_type || "",
    payload.recipient_custom || "",
    payload.occasion || "",
    payload.occasion_custom || "",
    payload.desired_effect || "",
    payload.desired_effect_custom || "",
    payload.taste_knowledge || "",
    payload.flower_id_link || "",
    payload.taste_note || "",
    payload.taste_style_hint || "",
    payload.taste_palette_hint || "",
    payload.taste_format_hint || "",
    join(payload.avoid_items),
    payload.budget || "",
    payload.recommended_style || "",
    payload.selected_option || "",
    payload.selected_card_text || "",
    payload.postcard_text || "",
    payload.telegram_clicked ? "TRUE" : "FALSE",
    payload.source || "",
    payload.status || "",
    payload.last_step || "",
    JSON.stringify(payload),
  ]);
}

function findLatestRequest(ss, requestId) {
  const sheet = getSheet(ss, "requests");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const idIndex = headers.indexOf("request_id");
  const payloadIndex = headers.indexOf("payload_json");
  if (idIndex === -1 || payloadIndex === -1) return null;

  for (let index = rows.length - 1; index >= 1; index -= 1) {
    if (String(rows[index][idIndex]) === String(requestId)) {
      return parsePayload(rows[index][payloadIndex]);
    }
  }
  return null;
}

function findLatestSubmissionByRequest(ss, requestId) {
  const sheet = getSheet(ss, "submissions");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const requestIndex = headers.indexOf("request_id");
  const payloadIndex = headers.indexOf("payload_json");
  if (requestIndex === -1 || payloadIndex === -1) return null;

  for (let index = rows.length - 1; index >= 1; index -= 1) {
    if (String(rows[index][requestIndex]) === String(requestId)) {
      return parsePayload(rows[index][payloadIndex]);
    }
  }
  return null;
}

function parsePayload(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function getSheet(ss, name) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const headers = SHEET_HEADERS[name];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return sheet;
  }
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missingHeaders = headers.filter((header) => existingHeaders.indexOf(header) === -1);
  if (missingHeaders.length) {
    sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
  return sheet;
}

function join(value) {
  return Array.isArray(value) ? value.join("; ") : "";
}

function value(object, key) {
  return object && object[key] ? object[key] : "";
}

function isProcessedRecord(recordId) {
  return PropertiesService.getScriptProperties().getProperty(processedRecordKey(recordId)) === "1";
}

function markProcessedRecord(recordId) {
  PropertiesService.getScriptProperties().setProperty(processedRecordKey(recordId), "1");
}

function processedRecordKey(recordId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(recordId));
  return "record_" + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function apiResponse(payload, callback) {
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(payload) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResponse(payload);
}
