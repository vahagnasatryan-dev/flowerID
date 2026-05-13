import type { Answers, FlowerRequest, FlowerSubmission, QuizEvent } from "./types";

const answersKey = "flower_portrait_answers";
const stepKey = "flower_portrait_step";
const eventKey = "quiz_events";
const submissionsKey = "flower_id_submissions";
const requestsKey = "flower_id_requests";

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
  const next: QuizEvent = {
    event_name,
    event_payload,
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(eventKey, JSON.stringify([...events, next]));
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
