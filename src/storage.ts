import type { Answers, CollectorRecord, CollectorRecordKind, FlowerRequest, FlowerSubmission, QuizEvent } from "./types";

const answersKey = "flower_portrait_answers";
const stepKey = "flower_portrait_step";
const eventKey = "quiz_events";
const submissionsKey = "flower_id_submissions";
const requestsKey = "flower_id_requests";
const collectorQueueKey = "flower_id_collector_queue";
const sessionKey = "flower_id_session_id";
const collectorUrl = import.meta.env.VITE_FLOWER_COLLECTOR_URL as string | undefined;

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

export function flushCollectorQueue() {
  if (!collectorUrl) return;
  const queue = loadCollectorQueue();
  if (!queue.length) return;

  const batch = queue.slice(0, 25);
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
      if (loadCollectorQueue().length) window.setTimeout(flushCollectorQueue, 600);
    })
    .catch(() => {
      window.setTimeout(flushCollectorQueue, 5000);
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
  const record: CollectorRecord = {
    id: `${kind}_${id}_${Date.now()}`,
    kind,
    session_id: getSessionId(),
    created_at: new Date().toISOString(),
    payload,
  };
  const queue = [...loadCollectorQueue(), record].slice(-500);
  localStorage.setItem(collectorQueueKey, JSON.stringify(queue));
  flushCollectorQueue();
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
