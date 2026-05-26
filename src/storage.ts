import type { Answers, CollectorRecord, CollectorRecordKind, FlowerOrder, FlowerRequest, FlowerSubmission, GiftBouquetProposal, GiftRequest, QuizEvent, ResultFeedbackRecord } from "./types";

const answersKey = "flower_portrait_answers";
const stepKey = "flower_portrait_step";
const eventKey = "quiz_events";
const submissionsKey = "flower_id_submissions";
const requestsKey = "flower_id_requests";
const feedbackKey = "flower_id_result_feedback";
const ordersKey = "flower_id_orders";
const giftRequestsKey = "flower_id_gift_requests";
const giftBouquetsKey = "flower_id_gift_bouquets";
const collectorQueueKey = "flower_id_collector_queue";
const sessionKey = "flower_id_session_id";
const editingSubmissionKey = "flower_id_editing_submission";
const collectorUrl = import.meta.env.VITE_FLOWER_COLLECTOR_URL as string | undefined;

let collectorFlushInFlight = false;
let collectorFlushTimer: number | null = null;

export function loadAnswers<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(answersKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveAnswers(answers: Answers) {
  localStorage.setItem(answersKey, JSON.stringify(answers));
}

export function loadStep() {
  const value = Number(localStorage.getItem(stepKey));
  return Number.isFinite(value) ? value : 0;
}

export function saveStep(step: number) {
  localStorage.setItem(stepKey, String(step));
}

export function resetStorage() {
  localStorage.removeItem(answersKey);
  localStorage.removeItem(stepKey);
}

export function startEditingSubmission(id: string) {
  sessionStorage.setItem(editingSubmissionKey, id);
}

export function loadEditingSubmissionId() {
  return sessionStorage.getItem(editingSubmissionKey);
}

export function clearEditingSubmission() {
  sessionStorage.removeItem(editingSubmissionKey);
}

export function track(event_name: string, event_payload: Record<string, unknown> = {}) {
  const events = loadEvents();
  const session_id = getSessionId();
  const next: QuizEvent = {
    id: createId("evt"),
    session_id,
    event_name,
    event_payload,
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(eventKey, JSON.stringify([...events, next]));
  enqueueCollectorRecord("event", next.id, next as unknown as Record<string, unknown>);
}

export function loadEvents(): QuizEvent[] {
  try {
    const raw = localStorage.getItem(eventKey);
    return raw ? (JSON.parse(raw) as QuizEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveSubmission(submission: FlowerSubmission) {
  const submissions = loadSubmissions();
  localStorage.setItem(submissionsKey, JSON.stringify({ ...submissions, [submission.id]: submission }));
  enqueueCollectorRecord("submission", submission.id, submission as unknown as Record<string, unknown>);
}

export function loadSubmission(id: string) {
  return loadSubmissions()[id] ?? null;
}

export function loadSubmissions(): Record<string, FlowerSubmission> {
  try {
    const raw = localStorage.getItem(submissionsKey);
    return raw ? (JSON.parse(raw) as Record<string, FlowerSubmission>) : {};
  } catch {
    return {};
  }
}

export function saveFlowerRequest(request: FlowerRequest) {
  const requests = loadFlowerRequests();
  localStorage.setItem(requestsKey, JSON.stringify({ ...requests, [request.id]: request }));
  enqueueCollectorRecord("request", request.id, request as unknown as Record<string, unknown>);
}

export function loadFlowerRequest(id: string) {
  return loadFlowerRequests()[id] ?? null;
}

export function loadFlowerRequests(): Record<string, FlowerRequest> {
  try {
    const raw = localStorage.getItem(requestsKey);
    return raw ? (JSON.parse(raw) as Record<string, FlowerRequest>) : {};
  } catch {
    return {};
  }
}

export async function syncFlowerRequestStatus(id: string) {
  if (!collectorUrl) return loadFlowerRequest(id);
  const response = await collectorJsonp<{
    ok: boolean;
    request?: FlowerRequest | null;
    submission?: FlowerSubmission | null;
  }>({ action: "get_request", request_id: id });

  if (!response?.ok) return loadFlowerRequest(id);

  if (response.submission?.id) {
    const submissions = loadSubmissions();
    localStorage.setItem(submissionsKey, JSON.stringify({ ...submissions, [response.submission.id]: response.submission }));
  }

  if (response.request?.id) {
    const request = response.submission?.id && response.request.status !== "completed"
      ? {
        ...response.request,
        status: "completed" as const,
        submissionId: response.submission.id,
        completed_at: response.request.completed_at ?? response.submission.created_at,
      }
      : response.request;
    const requests = loadFlowerRequests();
    localStorage.setItem(requestsKey, JSON.stringify({ ...requests, [request.id]: request }));
    return request;
  }

  if (response.submission?.id) {
    const localRequest = loadFlowerRequest(id);
    if (localRequest) {
      const completedRequest: FlowerRequest = {
        ...localRequest,
        status: "completed",
        submissionId: response.submission.id,
        completed_at: localRequest.completed_at ?? response.submission.created_at,
      };
      const requests = loadFlowerRequests();
      localStorage.setItem(requestsKey, JSON.stringify({ ...requests, [completedRequest.id]: completedRequest }));
      return completedRequest;
    }
  }

  return loadFlowerRequest(id);
}

export function saveResultFeedback(feedback: ResultFeedbackRecord) {
  const feedbackRecords = loadResultFeedback();
  localStorage.setItem(feedbackKey, JSON.stringify({ ...feedbackRecords, [feedback.id]: feedback }));
}

export function saveFlowerOrder(order: FlowerOrder) {
  const orders = loadFlowerOrders();
  localStorage.setItem(ordersKey, JSON.stringify({ ...orders, [order.id]: order }));
  enqueueCollectorRecord("order", order.id, order as unknown as Record<string, unknown>);
}

export function saveGiftRequest(request: GiftRequest) {
  const requests = loadGiftRequests();
  localStorage.setItem(giftRequestsKey, JSON.stringify({ ...requests, [request.id]: request }));
  enqueueCollectorRecord("gift_request", request.id, request as unknown as Record<string, unknown>);
}

export function saveGiftBouquetOptions(requestId: string, options: GiftBouquetProposal[]) {
  const all = loadGiftBouquetOptionsMap();
  const updatedAt = new Date().toISOString();
  const next = { ...all, [requestId]: options };
  try {
    localStorage.setItem(giftBouquetsKey, JSON.stringify(next));
  } catch (error) {
    // Images are stored as data URLs in the MVP admin. If old test photos fill
    // the browser quota, keep only the current request instead of failing silently.
    localStorage.setItem(giftBouquetsKey, JSON.stringify({ [requestId]: options }));
  }
  enqueueCollectorRecord("gift_bouquets", requestId, {
    gift_request_id: requestId,
    updated_at: updatedAt,
    options: options.map((option) => ({
      ...option,
      image: option.image?.startsWith("data:") ? "[uploaded image stored locally]" : option.image,
    })),
  });
}

export function loadGiftBouquetOptions(requestId: string): GiftBouquetProposal[] {
  return loadGiftBouquetOptionsMap()[requestId] ?? [];
}

export function loadGiftBouquetOptionsMap(): Record<string, GiftBouquetProposal[]> {
  try {
    const raw = localStorage.getItem(giftBouquetsKey);
    return raw ? (JSON.parse(raw) as Record<string, GiftBouquetProposal[]>) : {};
  } catch {
    return {};
  }
}

export async function syncGiftBouquetOptions(requestId: string) {
  if (!collectorUrl) return loadGiftBouquetOptions(requestId);
  const response = await collectorJsonp<{
    ok: boolean;
    options?: GiftBouquetProposal[];
  }>({ action: "get_gift_bouquets", gift_request_id: requestId });

  if (!response?.ok || !response.options) return loadGiftBouquetOptions(requestId);
  const all = loadGiftBouquetOptionsMap();
  localStorage.setItem(giftBouquetsKey, JSON.stringify({ ...all, [requestId]: response.options }));
  return response.options;
}

export function loadGiftRequest(id: string) {
  return loadGiftRequests()[id] ?? null;
}

export function loadGiftRequests(): Record<string, GiftRequest> {
  try {
    const raw = localStorage.getItem(giftRequestsKey);
    return raw ? (JSON.parse(raw) as Record<string, GiftRequest>) : {};
  } catch {
    return {};
  }
}

export async function syncGiftRequests() {
  if (!collectorUrl) return loadGiftRequests();
  const response = await collectorJsonp<{
    ok: boolean;
    requests?: GiftRequest[];
  }>({ action: "get_gift_requests" });

  if (!response?.ok || !response.requests) return loadGiftRequests();
  const local = loadGiftRequests();
  const synced = response.requests.reduce<Record<string, GiftRequest>>((acc, request) => {
    if (request?.id) acc[request.id] = request;
    return acc;
  }, {});
  const merged = { ...local, ...synced };
  localStorage.setItem(giftRequestsKey, JSON.stringify(merged));
  return merged;
}

export function loadFlowerOrders(): Record<string, FlowerOrder> {
  try {
    const raw = localStorage.getItem(ordersKey);
    return raw ? (JSON.parse(raw) as Record<string, FlowerOrder>) : {};
  } catch {
    return {};
  }
}

export function loadResultFeedback(): Record<string, ResultFeedbackRecord> {
  try {
    const raw = localStorage.getItem(feedbackKey);
    return raw ? (JSON.parse(raw) as Record<string, ResultFeedbackRecord>) : {};
  } catch {
    return {};
  }
}

export function flushCollectorQueue() {
  if (!collectorUrl) return;
  if (collectorFlushInFlight) return;
  const queue = loadCollectorQueue();
  if (!queue.length) return;

  collectorFlushInFlight = true;
  const batch = queue.slice(0, 25);
  let didFail = false;
  fetch(collectorUrl, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      app: "flower_id",
      schema_version: 1,
      sent_at: new Date().toISOString(),
      records: batch,
    }),
  })
    .then(() => {
      const sent = new Set(batch.map((item) => item.id));
      localStorage.setItem(collectorQueueKey, JSON.stringify(loadCollectorQueue().filter((item) => !sent.has(item.id))));
    })
    .catch(() => {
      didFail = true;
    })
    .finally(() => {
      collectorFlushInFlight = false;
      if (loadCollectorQueue().length) scheduleCollectorFlush(didFail ? 5000 : 600);
    });
}

export function getCollectorQueueSize() {
  return loadCollectorQueue().length;
}

export function isCollectorConfigured() {
  return Boolean(collectorUrl);
}

export function getCollectorUrlHint() {
  if (!collectorUrl) return "";
  try {
    const url = new URL(collectorUrl);
    return `${url.hostname}${url.pathname.slice(0, 24)}...`;
  } catch {
    return "configured";
  }
}

export function sendCollectorDebugRecord() {
  const id = createId("debug");
  enqueueCollectorRecord("event", id, {
    id,
    session_id: getSessionId(),
    event_name: "debug_collector_test",
    event_payload: {
      source: "metrics_debug",
      page: window.location.href,
      user_agent: navigator.userAgent,
    },
    created_at: new Date().toISOString(),
  });
}

function enqueueCollectorRecord(kind: CollectorRecordKind, id: string, payload: Record<string, unknown>) {
  const recordId = createCollectorRecordId(kind, id, payload);
  const record: CollectorRecord = {
    id: recordId,
    kind,
    session_id: getSessionId(),
    created_at: new Date().toISOString(),
    payload,
  };
  const queue = [...loadCollectorQueue().filter((item) => item.id !== recordId), record].slice(-500);
  localStorage.setItem(collectorQueueKey, JSON.stringify(queue));
  scheduleCollectorFlush();
}

function createCollectorRecordId(kind: CollectorRecordKind, id: string, payload: Record<string, unknown>) {
  if (kind === "submission") {
    const moment = String(payload.updated_at || payload.created_at || "");
    return `${kind}_${id}_${moment}`;
  }
  if (kind === "request") {
    const status = String(payload.status || "unknown");
    const moment = String(payload.completed_at || payload.started_at || payload.opened_at || payload.created_at || "");
    return `${kind}_${id}_${status}_${moment}`;
  }
  if (kind === "gift_request") {
    const status = String(payload.status || "created");
    const moment = String(payload.updated_at || payload.created_at || "");
    return `${kind}_${id}_${status}_${moment}`;
  }
  if (kind === "gift_bouquets") {
    return `${kind}_${id}`;
  }
  return `${kind}_${id}`;
}

function scheduleCollectorFlush(delay = 250) {
  if (!collectorUrl) return;
  if (collectorFlushTimer !== null) window.clearTimeout(collectorFlushTimer);
  collectorFlushTimer = window.setTimeout(() => {
    collectorFlushTimer = null;
    flushCollectorQueue();
  }, delay);
}

function collectorJsonp<T>(params: Record<string, string>) {
  return new Promise<T | null>((resolve) => {
    const callbackName = `flowerIdCollector_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const cleanup = (script: HTMLScriptElement) => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      script.remove();
    };
    const script = document.createElement("script");
    const url = new URL(collectorUrl as string);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("callback", callbackName);
    const timeout = window.setTimeout(() => {
      cleanup(script);
      resolve(null);
    }, 6000);

    (window as unknown as Record<string, (payload: T) => void>)[callbackName] = (payload: T) => {
      window.clearTimeout(timeout);
      cleanup(script);
      resolve(payload);
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      cleanup(script);
      resolve(null);
    };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function loadCollectorQueue(): CollectorRecord[] {
  try {
    const raw = localStorage.getItem(collectorQueueKey);
    return raw ? (JSON.parse(raw) as CollectorRecord[]) : [];
  } catch {
    return [];
  }
}

function getSessionId() {
  const existing = sessionStorage.getItem(sessionKey);
  if (existing) return existing;
  const next = createId("sid");
  sessionStorage.setItem(sessionKey, next);
  return next;
}

function createId(prefix: string) {
  if ("crypto" in window && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
