import { useEffect, useMemo, useState } from "react";
import {
  bouquetCards,
  moods,
  packagingOptions,
  palettes,
  totalSteps,
} from "./data";
import { computeProfile, getBouquetHardNo, getPublicPayload } from "./scoring";
import {
  clearEditingSubmission,
  flushCollectorQueue,
  getCollectorQueueSize,
  getCollectorUrlHint,
  isCollectorConfigured,
  loadAnswers,
  loadEditingSubmissionId,
  loadFlowerRequest,
  loadStep,
  loadSubmission,
  loadSubmissions,
  resetStorage,
  saveAnswers,
  saveFlowerRequest,
  saveStep,
  saveSubmission,
  sendCollectorDebugRecord,
  startEditingSubmission,
  track,
} from "./storage";
import type { Answers, ComputedProfile, FlowerRequest, FlowerReaction, FlowerSubmission, Option, Reaction } from "./types";

const defaultAnswers: Answers = {
  bouquet_swipes: [],
  mood: [],
  favorite_palettes: [],
  ideal_palette: "",
  rejected_palettes: [],
  flowers: {},
  size: "medium",
  wow_vs_practical: 3,
  fragrance: "",
  longevity: "",
  home_conditions: [],
  allergies: { has_allergy: false, kind: "", comment: "" },
  packaging: [],
  packaging_stoplist: [],
  associations: [],
  personal_note: "",
  user: { name: "", phone: "", telegram: "" },
};

const stepNames = [
  "start",
  "visual_taste",
  "mood",
  "palette",
  "flowers",
  "stoplist",
  "packaging",
  "name",
];
const quizStepLabels = [
  "Визуальный вкус",
  "Настроение",
  "Палитра",
  "Цветы",
  "Стоп-лист",
  "Упаковка",
  "Имя",
];
const activeQuizKey = "flower_id_active_quiz";

export default function App() {
  const publicPayload = readPublicPayload();
  const [routeKey, setRouteKey] = useState(() => window.location.pathname + window.location.search);
  const [quizActive, setQuizActive] = useState(() => sessionStorage.getItem(activeQuizKey) === "1");

  useEffect(() => {
    const onPopState = () => {
      setQuizActive(sessionStorage.getItem(activeQuizKey) === "1");
      setRouteKey(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    flushCollectorQueue();
    window.addEventListener("online", flushCollectorQueue);
    return () => window.removeEventListener("online", flushCollectorQueue);
  }, []);

  const navigate = (url: string) => {
    window.history.pushState({}, "", url);
    setQuizActive(sessionStorage.getItem(activeQuizKey) === "1");
    setRouteKey(window.location.pathname + window.location.search);
  };

  if (publicPayload) return <PublicProfile payload={publicPayload} />;

  const path = window.location.pathname;
  if (path === "/quiz") {
    const target = `/${window.location.search}`;
    window.history.replaceState({}, "", target);
    return <LandingPage navigate={navigate} startQuiz={() => setQuizActive(true)} key={routeKey} />;
  }
  if (path === "/request") return <RequestPage navigate={navigate} />;
  if (path === "/my-flower-id") return <MyFlowerIdPage navigate={navigate} startQuiz={() => setQuizActive(true)} />;
  if (path === "/metrics-debug") return <MetricsDebugPage navigate={navigate} />;
  if (path.startsWith("/r/")) return <RecipientRequestPage requestToken={decodeURIComponent(path.split("/r/")[1] || "")} navigate={navigate} />;
  if (path.startsWith("/result/")) return <StoredResultPage submissionId={decodeURIComponent(path.split("/result/")[1] || "")} navigate={navigate} />;
  if (path === "/" && quizActive) return <QuizApp navigate={navigate} onExit={() => setQuizActive(false)} />;
  return <LandingPage navigate={navigate} startQuiz={() => setQuizActive(true)} key={routeKey} />;
}

function QuizApp({ navigate, onExit }: { navigate: (url: string) => void; onExit: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const referrerId = params.get("ref");
  const requestId = params.get("requestId");
  const editingSubmissionId = loadEditingSubmissionId();
  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(defaultAnswers));
  const [step, setStep] = useState(() => Math.min(loadStep(), totalSteps - 1));
  const [toast, setToast] = useState("");
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishMessage, setFinishMessage] = useState("Мы собираем твой Flower ID...");
  const profile = useMemo(() => computeProfile(answers), [answers]);

  useEffect(() => {
    saveAnswers(answers);
  }, [answers]);

  useEffect(() => {
    saveStep(step);
    track("step_viewed", { step: stepNames[step], quiz_step: step ? step : null });
  }, [step]);

  const patchAnswers = (patch: Partial<Answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
  };

  const finishQuiz = () => {
    track("quiz_completed", { primary_archetype: profile.primary_archetype, requestId, referrerId, editingSubmissionId });
    const existingSubmission = editingSubmissionId ? loadSubmission(editingSubmissionId) : null;
    const id = editingSubmissionId || createId("fid");
    const now = new Date().toISOString();
    const submission: FlowerSubmission = {
      id,
      created_at: existingSubmission?.created_at || now,
      updated_at: editingSubmissionId ? now : undefined,
      answers,
      computed_profile: profile,
      source: params.get("source"),
      referrer_id: referrerId,
      request_id: requestId,
    };
    saveSubmission(submission);
    if (requestId) {
      const request = loadFlowerRequest(requestId);
      if (request) {
        saveFlowerRequest({
          ...request,
          status: "completed",
          submissionId: id,
          completed_at: new Date().toISOString(),
        });
        track("request_completed", { requestId, submissionId: id });
      }
    }
    resetStorage();
    clearEditingSubmission();
    sessionStorage.removeItem(activeQuizKey);
    onExit();
    navigate(`/result/${id}${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ""}`);
  };

  const next = () => {
    const message = validateStep(step, answers);
    if (message) {
      showToast(message);
      return;
    }
    if (step === 7) {
      setIsFinishing(true);
      setFinishMessage("Мы собираем твой Flower ID...");
      window.setTimeout(() => setFinishMessage("Готово — сейчас покажем твой цветочный профиль."), 760);
      window.setTimeout(finishQuiz, 1450);
      return;
    }
    setStep((value) => Math.min(value + 1, totalSteps - 1));
  };

  const startFresh = () => {
    const freshAnswers = structuredClone(defaultAnswers);
    resetStorage();
    sessionStorage.setItem(activeQuizKey, "1");
    setAnswers(freshAnswers);
    setStep(1);
    saveAnswers(freshAnswers);
    saveStep(1);
    track("quiz_started");
    if (requestId) {
      const request = loadFlowerRequest(requestId);
      if (request) {
        saveFlowerRequest({ ...request, status: "started_quiz", started_at: new Date().toISOString() });
        track("request_quiz_started", { requestId });
      }
    }
  };

  const resetProgress = () => {
    const freshAnswers = structuredClone(defaultAnswers);
    resetStorage();
    clearEditingSubmission();
    sessionStorage.removeItem(activeQuizKey);
    onExit();
    setAnswers(freshAnswers);
    setStep(0);
    saveAnswers(freshAnswers);
    saveStep(0);
    showToast("Прогресс сброшен");
  };

  const back = () => setStep((value) => Math.max(value - 1, 1));

  const restart = () => {
    resetStorage();
    clearEditingSubmission();
    sessionStorage.removeItem(activeQuizKey);
    onExit();
    setAnswers(defaultAnswers);
    setStep(0);
    track("quiz_restarted");
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="quiz-frame">
        <Header step={step} onBack={back} />

        {isFinishing && <LoadingScreen message={finishMessage} />}

        {step === 0 && <StartScreen onStart={startFresh} onReset={resetProgress} />}
        {!isFinishing && step === 1 && (
          <SwipeScreen
            swipes={answers.bouquet_swipes}
            onReact={(cardId, reaction) => {
              patchAnswers({
                bouquet_swipes: [
                  ...answers.bouquet_swipes.filter((item) => item.card_id !== cardId),
                  { card_id: cardId, reaction },
                ],
              });
              track("bouquet_rated", { card_id: cardId, reaction });
            }}
          />
        )}
        {!isFinishing && step === 2 && (
          <ChoiceScreen
            title="Какое настроение должно быть у твоего идеального букета?"
            hint="Выбери до 3 вариантов."
            options={moods}
            selected={answers.mood}
            max={3}
            onToggle={(id) => patchAnswers({ mood: toggle(answers.mood, id, 3) })}
          />
        )}
        {!isFinishing && step === 3 && (
          <PaletteScreen
            answers={answers}
            onChange={patchAnswers}
          />
        )}
        {!isFinishing && step === 4 && (
          <FlowersScreen
            flowers={answers.flowers}
            onChange={(flowers) => patchAnswers({ flowers })}
          />
        )}
        {!isFinishing && step === 5 && (
          <PracticalScreen
            answers={answers}
            onChange={patchAnswers}
          />
        )}
        {!isFinishing && step === 6 && (
          <PackagingScreen
            answers={answers}
            onChange={patchAnswers}
          />
        )}
        {!isFinishing && step === 7 && <NameScreen answers={answers} onChange={patchAnswers} />}
        {!isFinishing && step > 0 && (
          <QuizNav
            step={step}
            onBack={back}
            onNext={() => {
              track(`${stepNames[step]}_continued`, stepEventPayload(step, answers));
              next();
            }}
            nextDisabled={Boolean(validateStep(step, answers))}
            nextLabel={step === 7 ? "Показать мой Flower ID" : "Дальше"}
          />
        )}
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function PublicProfile({
  payload,
}: {
  payload: {
    name: string;
    flower_id?: string;
    title: string;
    description: string;
    preferred_colors: string[];
    favorite_flowers: string[];
    avoid_flowers: string[];
    preferred_format: string;
  };
}) {
  return (
    <main className="app-shell">
      <section className="quiz-frame public-frame">
        <div className="screen result-screen">
          <p className="eyebrow">{payload.name ? `Портрет: ${payload.name}` : "Цветочный портрет"}</p>
          {payload.flower_id && <span className="flower-id-pill">{payload.flower_id}</span>}
          <h1>{payload.title}</h1>
          <p className="lead">{payload.description}</p>
          <div className="result-grid">
            <ResultBlock title="Любимые палитры" items={payload.preferred_colors} />
            <ResultBlock title="Любимые цветы" items={payload.favorite_flowers} fallback="Подобрать по стилю" />
            <ResultBlock title="Что нельзя использовать" items={payload.avoid_flowers} fallback="Жесткого стоп-листа нет" />
            <ResultBlock title="Предпочтительный формат" items={[payload.preferred_format]} />
          </div>
          <button className="primary-button" onClick={() => track("order_by_profile_clicked", { source: "public_profile" })}>
            Заказать букет по этому портрету
          </button>
        </div>
      </section>
    </main>
  );
}

function LandingPage({ navigate, startQuiz }: { navigate: (url: string) => void; startQuiz: () => void }) {
  useEffect(() => {
    track("landing_viewed");
  }, []);

  const start = () => {
    const requestId = new URLSearchParams(window.location.search).get("requestId");
    resetStorage();
    saveAnswers(structuredClone(defaultAnswers));
    saveStep(1);
    sessionStorage.setItem(activeQuizKey, "1");
    track("start_quiz_clicked");
    if (requestId) {
      const request = loadFlowerRequest(requestId);
      if (request) {
        saveFlowerRequest({
          ...request,
          status: "started_quiz",
          started_at: request.started_at ?? new Date().toISOString(),
        });
        track("request_quiz_started", {
          requestId,
          requesterName: request.requesterName,
          recipientName: request.recipientName,
        });
      }
    }
    startQuiz();
    navigate(window.location.search ? `/${window.location.search}` : "/");
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="quiz-frame landing-frame">
        <header className="topbar start-topbar">
          <span className="brand-mark">Flower ID</span>
          <span className="start-topbar-note">для букетов без ошибок</span>
        </header>
        <section className="screen hero-screen landing-screen">
          <div className="hero-layout">
            <div className="hero-copy">
              <p className="eyebrow">Цветочный профиль</p>
              <h1>Создай свой<br />цветочный профиль</h1>
              <p className="lead">
                Узнай, какие букеты тебе действительно подходят: стиль, палитра, любимые цветы, аромат, упаковка и стоп-лист.
              </p>
              <div className="hero-actions landing-actions">
                <button className="primary-button" onClick={start}>Создать мой Flower ID</button>
                <p className="cta-note">2 минуты · результатом можно поделиться</p>
                <button className="landing-request-link" onClick={() => {
                  track("request_flower_id_clicked", { source: "landing" });
                  navigate("/request");
                }}>
                  <span>Уже хотите подарить цветы?</span>
                  Узнать Flower ID другого человека →
                </button>
                <button className="landing-my-link" onClick={() => navigate("/my-flower-id")}>Мои сохраненные Flower ID</button>
              </div>
              <div className="landing-benefit">
                <strong>Близким проще выбрать.</strong>
                <strong>Тебе приятнее получать.</strong>
                <p>Поделись Flower ID — и тебе будут дарить букеты, которые действительно про тебя.</p>
              </div>
            </div>
            <div className="landing-visual">
              <div className="landing-flower" aria-hidden="true" />
              <article className="flower-id-preview-card" aria-label="Пример результата Flower ID">
                <span>Ваш Flower ID</span>
                <h2>Soft Minimalist</h2>
                <div className="preview-section">
                  <strong>Палитра</strong>
                  <div className="preview-palette" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  <p>молочный · пудровый · шалфейный</p>
                </div>
                <div className="preview-section">
                  <strong>Подходит</strong>
                  <p>ранункулюсы · анемоны · фрезия</p>
                </div>
                <div className="preview-section">
                  <strong>Не дарить</strong>
                  <p>красные розы · яркую упаковку</p>
                </div>
              </article>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function StoredResultPage({ submissionId, navigate }: { submissionId: string; navigate: (url: string) => void }) {
  const submission = loadSubmission(submissionId);
  const params = new URLSearchParams(window.location.search);
  const isShared = Boolean(params.get("ref"));
  const requestId = params.get("requestId");
  const [toast, setToast] = useState("");

  useEffect(() => {
    track(isShared ? "shared_result_opened" : "result_viewed", {
      submissionId,
      requestId,
      archetypeId: submission?.computed_profile.primary_archetype,
    });
  }, [isShared, requestId, submission?.computed_profile.primary_archetype, submissionId]);

  if (!submission) {
    return (
      <EmptyState
        title="Flower ID не найден"
        text="Создайте свой Flower ID или проверьте ссылку."
        action="Создать свой Flower ID"
        onAction={() => navigate("/")}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={8} onBack={() => navigate("/")} />
        <ResultScreen
          answers={submission.answers}
          profile={submission.computed_profile}
          context={isShared ? "shared" : "own"}
          submissionId={submission.id}
          requestId={requestId}
          navigate={navigate}
          onEdit={() => editSavedFlowerId(submission, navigate)}
          onRestart={() => navigate("/")}
          onToast={(message) => {
            setToast(message);
            window.setTimeout(() => setToast(""), 2600);
          }}
        />
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function MyFlowerIdPage({ navigate, startQuiz }: { navigate: (url: string) => void; startQuiz: () => void }) {
  const submissions = Object.values(loadSubmissions()).sort((a, b) =>
    (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at),
  );
  const [toast, setToast] = useState("");

  const copy = async (submission: FlowerSubmission) => {
    const link = createPublicLink(submission.answers, submission.computed_profile, submission.id);
    await navigator.clipboard.writeText(link);
    track("saved_flower_id_link_copied", { submissionId: submission.id });
    setToast("Ссылка скопирована");
    window.setTimeout(() => setToast(""), 2200);
  };

  const createNew = () => {
    resetStorage();
    clearEditingSubmission();
    saveAnswers(structuredClone(defaultAnswers));
    saveStep(1);
    sessionStorage.setItem(activeQuizKey, "1");
    track("saved_flower_id_create_new_clicked");
    startQuiz();
    navigate("/");
  };

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate("/")} />
        <section className="screen">
          <p className="eyebrow">Мои Flower ID</p>
          <h1>Сохраненные профили</h1>
          <p className="lead">Flower ID сохраняются на этом устройстве. Их можно открыть, отправить ссылкой или отредактировать без аккаунта.</p>
          {!submissions.length ? (
            <article className="message-card">
              <strong>Пока нет сохраненных Flower ID</strong>
              <p>Создайте первый профиль, и он появится здесь автоматически.</p>
            </article>
          ) : (
            <div className="saved-id-list">
              {submissions.map((submission) => (
                <article className="saved-id-card" key={submission.id}>
                  <span>{formatFlowerId(submission.id)}</span>
                  <h2>{submission.computed_profile.title}</h2>
                  <p>{submission.answers.user.name || "Без имени"} · {formatDate(submission.updated_at || submission.created_at)}</p>
                  <div className="saved-id-actions">
                    <button className="secondary-button" onClick={() => navigate(`/result/${submission.id}`)}>Открыть</button>
                    <button className="secondary-button" onClick={() => copy(submission)}>Отправить</button>
                    <button className="secondary-button" onClick={() => editSavedFlowerId(submission, navigate)}>Редактировать</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <button className="primary-button" onClick={createNew}>Создать новый Flower ID</button>
        </section>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function RequestPage({ navigate }: { navigate: (url: string) => void }) {
  const [form, setForm] = useState({ recipientName: "", requesterName: "", occasion: "", comment: "" });
  const [created, setCreated] = useState<FlowerRequest | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    track("request_started");
  }, []);

  const requestLink = created ? `${window.location.origin}/r/${encodeURIComponent(encodeRequestToken(created))}` : "";
  const readyMessage = created
    ? `${created.requesterName || "Привет"} хочет подарить цветы без ошибки.\nСоздай свой Flower ID - это займет около минуты и покажет твой цветочный стиль.\n${requestLink}`
    : "";

  const copy = async (text: string, eventName: string) => {
    await navigator.clipboard.writeText(text);
    track(eventName, { requestId: created?.id });
    setToast("Скопировано");
    window.setTimeout(() => setToast(""), 2200);
  };

  if (created) {
    return (
      <main className="app-shell">
        <section className="quiz-frame">
          <Header step={0} onBack={() => navigate("/")} />
          <section className="screen">
            <p className="eyebrow">Запрос Flower ID</p>
            <h1>Ссылка-запрос готова</h1>
            <p className="lead">Отправьте ее получателю. Когда он создаст Flower ID, вы сможете подобрать букет по реальному стилю.</p>
            <article className="message-card">{readyMessage}</article>
            <div className="action-stack">
              <button className="primary-button" onClick={() => openShare(readyMessage, requestLink, "request_share_clicked")}>Отправить</button>
              <button className="secondary-button" onClick={() => copy(readyMessage, "request_copy_message_clicked")}>Скопировать текст</button>
              <button className="secondary-button" onClick={() => copy(requestLink, "request_copy_link_clicked")}>Скопировать ссылку</button>
              <button className="text-button" onClick={() => navigate(`/r/${created.id}`)}>Открыть ссылку</button>
            </div>
          </section>
        </section>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate("/")} />
        <section className="screen">
          <p className="eyebrow">Для дарителя</p>
          <h1>Узнай Flower ID человека, которому хочешь подарить цветы</h1>
          <p className="lead">Отправь красивую ссылку: получатель создаст цветочный стиль, а ты сможешь заказать букет без риска ошибиться.</p>
          <div className="contact-panel">
            <label>Имя получателя<input value={form.recipientName} placeholder="Анна" onChange={(event) => setForm({ ...form, recipientName: event.target.value })} /></label>
            <label>От кого запрос<input value={form.requesterName} placeholder="Арман" onChange={(event) => setForm({ ...form, requesterName: event.target.value })} /></label>
            <label>Повод<input value={form.occasion} placeholder="день рождения, свидание, просто так" onChange={(event) => setForm({ ...form, occasion: event.target.value })} /></label>
            <label>Комментарий<textarea className="text-area" value={form.comment} placeholder="Хочу подарить тебе цветы, которые правда понравятся" onChange={(event) => setForm({ ...form, comment: event.target.value })} /></label>
          </div>
          <button className="primary-button" onClick={() => {
            if (!form.recipientName.trim()) {
              setToast("Укажите имя получателя");
              return;
            }
            const request: FlowerRequest = {
              id: createId("req"),
              requesterName: form.requesterName.trim(),
              recipientName: form.recipientName.trim(),
              occasion: form.occasion.trim(),
              comment: form.comment.trim(),
              status: "created",
              created_at: new Date().toISOString(),
            };
            saveFlowerRequest(request);
            setCreated(request);
            track("request_created", {
              requestId: request.id,
              requesterName: request.requesterName,
              recipientName: request.recipientName,
            });
          }}>Создать ссылку-запрос</button>
        </section>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function RecipientRequestPage({ requestToken, navigate }: { requestToken: string; navigate: (url: string) => void }) {
  const decodedRequest = useMemo(() => decodeRequestToken(requestToken), [requestToken]);
  const requestId = decodedRequest?.id || requestToken;
  const storedRequest = loadFlowerRequest(requestId);
  const request = storedRequest || decodedRequest;

  useEffect(() => {
    if (!request) return;
    const openedRequest: FlowerRequest = {
      ...request,
      status: request.status === "created" ? "opened" : request.status,
      opened_at: request.opened_at ?? new Date().toISOString(),
    };
    saveFlowerRequest(openedRequest);
    track("request_link_opened", {
      requestId: openedRequest.id,
      requesterName: openedRequest.requesterName,
      recipientName: openedRequest.recipientName,
    });
  }, [requestId, requestToken]);

  if (!request) {
    return <EmptyState title="Запрос не найден" text="Возможно, ссылка устарела. Можно создать свой Flower ID." action="Создать Flower ID" onAction={() => navigate("/")} />;
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate("/")} />
        <section className="screen hero-screen">
          <p className="eyebrow">Тебе отправили запрос</p>
          <h1>{request.requesterName ? `${request.requesterName} хочет узнать твой Flower ID` : "У тебя запросили Flower ID"}</h1>
          <p className="lead">Создай свой цветочный стиль, чтобы тебе дарили букеты, которые действительно подходят.</p>
          {request.occasion && <article className="result-block"><span>Повод</span><p>{request.occasion}</p></article>}
          {request.comment && <article className="message-card">{request.comment}</article>}
          <button className="primary-button" onClick={() => navigate(`/?requestId=${encodeURIComponent(request.id)}`)}>Создать мой Flower ID</button>
          <button className="text-button" onClick={() => navigate("/")}>Просто создать свой Flower ID</button>
        </section>
      </section>
    </main>
  );
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <section className="screen hero-screen">
          <p className="eyebrow">Flower ID</p>
          <h1>{title}</h1>
          <p className="lead">{text}</p>
          <button className="primary-button" onClick={onAction}>{action}</button>
        </section>
      </section>
    </main>
  );
}

function MetricsDebugPage({ navigate }: { navigate: (url: string) => void }) {
  const [queueSize, setQueueSize] = useState(() => getCollectorQueueSize());
  const [message, setMessage] = useState("");
  const configured = isCollectorConfigured();

  const refresh = () => setQueueSize(getCollectorQueueSize());
  const sendTest = () => {
    sendCollectorDebugRecord();
    flushCollectorQueue();
    setMessage("Тестовая запись поставлена в очередь. Через несколько секунд проверьте лист events.");
    window.setTimeout(refresh, 800);
    window.setTimeout(refresh, 2500);
  };

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate("/")} />
        <section className="screen">
          <p className="eyebrow">Диагностика</p>
          <h1>Сбор метрик</h1>
          <div className="result-grid">
            <ResultBlock title="Collector URL" items={[configured ? `Подключен: ${getCollectorUrlHint()}` : "Не подключен"]} />
            <ResultBlock title="Очередь" items={[`${queueSize} записей`]} />
          </div>
          <div className="action-stack">
            <button className="primary-button" onClick={sendTest} disabled={!configured}>Отправить тестовую запись</button>
            <button className="secondary-button" onClick={() => {
              flushCollectorQueue();
              window.setTimeout(refresh, 800);
            }}>Повторить отправку очереди</button>
            <button className="text-button" onClick={() => navigate("/")}>На главную</button>
          </div>
          {message && <p className="hint">{message}</p>}
          {!configured && (
            <p className="hint">
              В Vercel нужно добавить переменную VITE_FLOWER_COLLECTOR_URL и сделать redeploy.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}

function Header({ step, onBack }: { step: number; onBack: () => void }) {
  if (step === 0) {
    return (
      <header className="topbar start-topbar">
        <span className="brand-mark">Flower ID</span>
        <span className="start-topbar-note">2 минуты · без анкеты</span>
      </header>
    );
  }

  const activeStep = Math.min(Math.max(step, 1), quizStepLabels.length);
  const label = quizStepLabels[activeStep - 1] ?? "Flower ID";

  return (
    <header className="topbar">
      <button className="icon-button" onClick={onBack} disabled={step === 0} aria-label="Назад">
        <span aria-hidden="true">‹</span>
      </button>
      <div className="progress-wrap" aria-label={`Шаг ${activeStep} из 7`}>
        <span>Шаг {activeStep} из 7</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(activeStep / quizStepLabels.length) * 100}%` }} />
        </div>
      </div>
      <span className="step-count">{label}</span>
    </header>
  );
}

function StartScreen({ onStart, onReset }: { onStart: () => void; onReset: () => void }) {
  useEffect(() => {
    track("quiz_opened");
  }, []);

  const intakeSteps = [
    ["01", "Визуальный вкус", "Свайпы букетов быстро отделяют «мое» от «точно нет»."],
    ["02", "Палитра и цветы", "Любимые оттенки, спорные сочетания и личный стоп-лист."],
    ["03", "Флористический бриф", "Итог можно отправить флористу или человеку, который выбирает подарок."],
  ];
  const profileParts = ["палитры", "любимые цветы", "стоп-лист", "аромат", "подача", "формат"];
  const scenarios = [
    "Перед заказом букета",
    "Чтобы подсказать близким",
    "Для базы предпочтений клиента",
  ];

  return (
    <section className="screen hero-screen">
      <div className="hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">Flower ID · сбор предпочтений</p>
          <h1>Соберите Flower ID за 3 минуты</h1>
          <p className="lead">
            Мини-тест превращает реакции на букеты, цвета и подачу в понятный Flower ID: что нравится,
            чего избегать и как собрать букет, который попадет в человека.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onStart}>
              Собрать Flower ID
            </button>
            <a className="secondary-link" href="#flower-id-preview">
              Посмотреть итог
            </a>
          </div>
        </div>
        <div className="hero-botanical" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="landing-section landing-problem">
        <p className="eyebrow">Зачем</p>
        <h2>Букеты часто выбирают по памяти, а не по вкусу</h2>
        <p className="hint">
          Flower ID собирает не абстрактное «люблю розы», а рабочий профиль: настроение, цвет, фактуру,
          аллергии, стоп-лист и формат подачи.
        </p>
      </div>

      <div className="landing-section">
        <p className="eyebrow">Как собираем</p>
        <div className="intake-steps">
          {intakeSteps.map(([number, title, text]) => (
            <article className="intake-step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="landing-section" id="flower-id-preview">
        <p className="eyebrow">Что получится</p>
        <div className="profile-preview">
          <div>
            <span className="preview-label">Flower ID</span>
            <h2>Садовая романтика с мягкой палитрой</h2>
            <p>
              Нежные оттенки, свободная форма, пионы и ранункулюсы. Без резкого аромата,
              кислотных цветов и глянцевой упаковки.
            </p>
          </div>
          <div className="preview-tags">
            {profileParts.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="landing-section">
        <p className="eyebrow">Для кого</p>
        <div className="scenario-list">
          {scenarios.map((scenario) => (
            <span key={scenario}>{scenario}</span>
          ))}
        </div>
      </div>

      <div className="result-teaser">
        <span>Финал</span>
        <p>Готовый портрет можно скопировать, поделиться ссылкой или превратить в ТЗ для флориста.</p>
      </div>

      <button className="primary-button final-start" onClick={onStart}>
        Начать сбор Flower ID
      </button>
      <span className="time-note">Займет около 3 минут · можно пройти с телефона</span>
      <button className="text-button" onClick={onReset}>
        Сбросить сохраненный прогресс
      </button>
    </section>
  );
}

function SwipeScreen({
  swipes,
  onReact,
}: {
  swipes: Answers["bouquet_swipes"];
  onReact: (cardId: string, reaction: Reaction) => void;
}) {
  const firstUnrated = bouquetCards.findIndex((card) => !swipes.some((swipe) => swipe.card_id === card.id));
  const [index, setIndex] = useState(firstUnrated === -1 ? bouquetCards.length - 1 : firstUnrated);
  const current = bouquetCards[index];
  const completed = index >= bouquetCards.length;
  const ratedCount = swipes.length;

  const react = (reaction: Reaction) => {
    if (completed) return;
    onReact(current.id, reaction);
    setIndex((value) => Math.min(value + 1, bouquetCards.length));
  };

  return (
    <section className="screen quiz-screen">
      <p className="eyebrow">Визуальный стиль</p>
      <h2>Какие букеты тебе визуально ближе?</h2>
      <p className="hint">Оцени минимум 5 карточек. Остальные можно пропустить.</p>
      {!completed && <p className="card-step-count">Карточка {index + 1} из {bouquetCards.length}</p>}
      <div className="swipe-area">
        {!completed ? (
          <article
            className="bouquet-card"
            style={bouquetPhotoStyle(index)}
          >
            <div>
              <h3>{current.title}</h3>
              <p>{current.tags.join(" · ")}</p>
            </div>
          </article>
        ) : (
          <div className="complete-card">
            <h3>Готово</h3>
            <p>Переходим к настроению букета.</p>
          </div>
        )}
      </div>
      {!completed && (
        <div className="bouquet-choice-actions">
          <button type="button" onClick={() => react("love")}>Вау</button>
          <button type="button" onClick={() => react("like")}>Нравится</button>
          <button type="button" onClick={() => react("dislike")}>Не моё</button>
        </div>
      )}
      {!completed && (
        <button className="text-button skip-card-button" type="button" onClick={() => setIndex((value) => Math.min(value + 1, bouquetCards.length))}>
          Пропустить карточку
        </button>
      )}
      <p className="subtle">Оценено {ratedCount} из 5 минимум</p>
    </section>
  );
}

function ChoiceScreen({
  title,
  hint,
  options,
  selected,
  max,
  onToggle,
}: {
  title: string;
  hint: string;
  options: Option[];
  selected: string[];
  max?: number;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="screen quiz-screen">
      <p className="eyebrow">Настроение</p>
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      <div className="option-grid">
        {options.map((option) => (
          <button
            key={option.id}
            className={`choice-card ${selected.includes(option.id) ? "selected" : ""}`}
            onClick={() => onToggle(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {max && <p className="subtle">Выбрано {selected.length} из {max}</p>}
    </section>
  );
}

function PaletteScreen({
  answers,
  onChange,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
}) {
  const togglePalette = (id: string) => {
    const isUnknown = id === "florist_palette";
    if (isUnknown) {
      onChange({ favorite_palettes: answers.favorite_palettes.includes(id) ? [] : [id], ideal_palette: "", rejected_palettes: [] });
      return;
    }
    const selected = answers.favorite_palettes.filter((item) => item !== "florist_palette");
    onChange({
      favorite_palettes: toggle(selected, id, 3),
      ideal_palette: "",
      rejected_palettes: [],
    });
  };
  const paletteOptions = [...palettes, { id: "florist_palette", label: "Не знаю, пусть подберёт флорист", colors: ["#f8f4ef", "#d9cec2", "#9db4a2"], description: "" }];

  return (
    <section className="screen quiz-screen">
      <p className="eyebrow">Палитра</p>
      <h2>Какие оттенки тебе ближе?</h2>
      <p className="hint">Выбери до 3 палитр, которые тебе приятно получать в букете.</p>
      <div className="palette-board">
        {paletteOptions.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className={`palette-tile ${answers.favorite_palettes.includes(palette.id) ? "favorite" : ""}`}
            onClick={() => togglePalette(palette.id)}
          >
            <span className="palette-main">
              <div className="swatches">
                {palette.colors?.map((color) => <i key={color} style={{ background: color }} />)}
              </div>
              <span>{palette.label}</span>
              {palette.description && <small>{palette.description}</small>}
            </span>
          </button>
        ))}
      </div>
      <p className="subtle">Выбрано {answers.favorite_palettes.filter((id) => id !== "florist_palette").length} из 3</p>
    </section>
  );
}

function FlowersScreen({
  flowers,
  onChange,
}: {
  flowers: Answers["flowers"];
  onChange: (flowers: Answers["flowers"]) => void;
}) {
  const likedFlowerOptions: Option[] = [
    { id: "peony", label: "Пионы" },
    { id: "garden_rose", label: "Пионовидные розы" },
    { id: "ranunculus", label: "Ранункулюсы" },
    { id: "anemone", label: "Анемоны" },
    { id: "tulip", label: "Тюльпаны" },
    { id: "hydrangea", label: "Гортензии" },
    { id: "freesia", label: "Фрезии" },
    { id: "orchid", label: "Орхидеи" },
    { id: "calla", label: "Каллы" },
    { id: "field_flowers", label: "Полевые цветы" },
    { id: "lilac", label: "Сирень" },
    { id: "unknown_style", label: "Не знаю названия, важен общий стиль" },
  ];
  const avoidFlowerOptions: Option[] = [
    { id: "rose", label: "Красные розы" },
    { id: "chrysanthemum", label: "Хризантемы" },
    { id: "carnation", label: "Гвоздики" },
    { id: "lily", label: "Лилии" },
    { id: "gerbera", label: "Герберы" },
    { id: "orchid", label: "Орхидеи" },
    { id: "dried_flowers", label: "Сухоцветы" },
    { id: "none", label: "Нет таких" },
  ];
  const loved = Object.entries(flowers).filter(([, value]) => value === "love").map(([id]) => id);
  const forbidden = Object.entries(flowers).filter(([, value]) => value === "forbidden").map(([id]) => id);
  const setReaction = (id: string, reaction: FlowerReaction) => {
    const nextFlowers = { ...flowers };
    if (id === "none") {
      avoidFlowerOptions.forEach((option) => {
        if (option.id !== "none") delete nextFlowers[option.id];
      });
      nextFlowers.none = nextFlowers.none === "forbidden" ? "neutral" : "forbidden";
      onChange(nextFlowers);
      return;
    }
    delete nextFlowers.none;
    if (nextFlowers[id] === reaction) delete nextFlowers[id];
    else nextFlowers[id] = reaction;
    onChange(nextFlowers);
  };

  return (
    <section className="screen quiz-screen">
      <p className="eyebrow">Цветы</p>
      <h2>Какие цветы тебе особенно нравятся?</h2>
      <p className="hint">Выбери до 5. Можно пропустить.</p>
      <div className="chip-grid roomy-chips">
        {likedFlowerOptions.map((flower) => (
          <button
            key={flower.id}
            type="button"
            className={flowers[flower.id] === "love" ? "selected" : ""}
            onClick={() => {
              if (flowers[flower.id] !== "love" && loved.length >= 5) return;
              setReaction(flower.id, "love");
            }}
          >
            {flower.label}
          </button>
        ))}
      </div>
      <p className="subtle">Выбрано {loved.length} из 5</p>

      <div className="section-divider" />
      <h2 className="compact-heading">Есть цветы, которые лучше не дарить?</h2>
      <p className="hint">Выбери, если есть.</p>
      <div className="chip-grid roomy-chips">
        {avoidFlowerOptions.map((flower) => (
          <button
            key={flower.id}
            type="button"
            className={flowers[flower.id] === "forbidden" ? "selected" : ""}
            onClick={() => setReaction(flower.id, "forbidden")}
          >
            {flower.label}
          </button>
        ))}
      </div>
      <p className="subtle">{forbidden.filter((id) => id !== "none").length ? "Стоп-лист цветов сохранён." : "Этот блок можно пропустить."}</p>
    </section>
  );
}

function PracticalScreen({
  answers,
  onChange,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
}) {
  const setAllergy = (id: string) => {
    const fragrance = id === "scent_sensitive" ? "sensitive" : id === "none" ? "light" : answers.fragrance;
    onChange({
      fragrance,
      allergies: {
        has_allergy: id === "allergy",
        kind: id,
        comment: id === "allergy" ? answers.allergies.comment : "",
      },
    });
  };
  const stopOptions: Option[] = [
    { id: "too_bright", label: "Слишком яркие букеты" },
    { id: "too_colorful", label: "Слишком пёстрые букеты" },
    { id: "red_roses", label: "Красные розы" },
    { id: "too_much_wrap", label: "Много упаковки" },
    { id: "sparkles", label: "Блёстки, стразы, декор" },
    { id: "strong_scent", label: "Сильный аромат" },
    { id: "lily", label: "Лилии" },
    { id: "too_large", label: "Слишком большие букеты" },
    { id: "too_simple", label: "Слишком простые букеты" },
    { id: "no_hard_bans", label: "Нет жёстких запретов" },
  ];
  const allergyChoices: Option[] = [
    { id: "none", label: "Нет" },
    { id: "scent_sensitive", label: "Да, лучше без сильного аромата" },
    { id: "allergy", label: "Да, есть аллергии" },
    { id: "unknown", label: "Не знаю" },
  ];
  const toggleStop = (id: string) => {
    if (id === "no_hard_bans") {
      onChange({ packaging_stoplist: answers.packaging_stoplist.includes(id) ? [] : [id], flowers: { ...answers.flowers } });
      return;
    }
    const current = answers.packaging_stoplist.filter((item) => item !== "no_hard_bans");
    onChange({ packaging_stoplist: toggle(current, id) });
    if (id === "lily" || id === "red_roses") {
      onChange({ packaging_stoplist: toggle(current, id), flowers: { ...answers.flowers, [id === "lily" ? "lily" : "rose"]: "forbidden" } });
    }
    if (id === "strong_scent") {
      onChange({ packaging_stoplist: toggle(current, id), fragrance: "sensitive" });
    }
  };

  return (
    <section className="screen quiz-screen">
      <p className="eyebrow">Стоп-лист</p>
      <h2>Что точно лучше не дарить?</h2>
      <p className="hint">Это поможет близким не ошибиться.</p>
      <div className="chip-grid roomy-chips">
        {stopOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={answers.packaging_stoplist.includes(option.id) ? "selected" : ""}
            onClick={() => toggleStop(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <FieldSet title="Есть аллергии или чувствительность к запахам?" options={allergyChoices} selected={answers.allergies.kind} onSelect={setAllergy} />
      {answers.allergies.has_allergy && (
        <textarea
          className="text-area"
          placeholder="Напиши, чего точно избегать"
          value={answers.allergies.comment}
          onChange={(event) => onChange({ allergies: { ...answers.allergies, comment: event.target.value } })}
        />
      )}
    </section>
  );
}

function PackagingScreen({
  answers,
  onChange,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
}) {
  const sizeOptionsLite: Option[] = [
    { id: "mini", label: "Небольшой аккуратный" },
    { id: "medium", label: "Средний красивый" },
    { id: "large", label: "Большой вау-букет" },
    { id: "depends", label: "Зависит от повода" },
  ];
  const togglePackaging = (id: string) => onChange({ packaging: toggle(answers.packaging, id, 2) });

  return (
    <section className="screen quiz-screen">
      <p className="eyebrow">Подача</p>
      <h2>Какая подача тебе ближе?</h2>
      <p className="hint">Выбери 1–2 варианта.</p>
      <MultiField title="Упаковка" options={packagingOptions} selected={answers.packaging} onToggle={togglePackaging} />
      <FieldSet title="Какой размер букета тебе ближе?" options={sizeOptionsLite} selected={answers.size} onSelect={(size) => onChange({ size, wow_vs_practical: size === "large" ? 5 : 3 })} />
    </section>
  );
}

function NameScreen({
  answers,
  onChange,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
}) {
  return (
    <section className="screen quiz-screen name-screen">
      <p className="eyebrow">Финал</p>
      <h2>Почти готово</h2>
      <p className="hint">Как тебя зовут, чтобы мы красиво оформили твой Flower ID?</p>
      <div className="contact-panel">
        <label>
          Имя
          <input
            value={answers.user.name}
            onChange={(event) => onChange({ user: { ...answers.user, name: event.target.value } })}
            placeholder="Имя"
          />
        </label>
      </div>
      <p className="subtle">Регистрация не нужна. Результатом можно поделиться.</p>
    </section>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <section className="screen quiz-screen loading-screen">
      <div className="loading-flower" aria-hidden="true" />
      <h2>{message}</h2>
    </section>
  );
}

function ResultScreen({
  answers,
  profile,
  context,
  submissionId,
  requestId,
  navigate,
  onEdit,
  onRestart,
  onToast,
}: {
  answers: Answers;
  profile: ComputedProfile;
  context: "own" | "shared";
  submissionId: string;
  requestId?: string | null;
  navigate: (url: string) => void;
  onEdit?: () => void;
  onRestart: () => void;
  onToast: (message: string) => void;
}) {
  const publicLink = createPublicLink(answers, profile, submissionId);
  const referralLink = `${publicLink}?ref=${submissionId}`;
  const hardNo = getBouquetHardNo(answers);
  const name = answers.user.name || "получателя";
  const isShared = context === "shared";
  const copyText = `${profile.share_text}\nFlower ID:\n${publicLink}`;
  const orderMessage = buildOrderMessage(answers, profile, publicLink, requestId);

  const copy = async (text: string, eventName: string) => {
    await navigator.clipboard.writeText(text);
    track(eventName, { submissionId, primary_archetype: profile.primary_archetype });
    onToast("Скопировано");
  };

  const share = async () => {
    const text = isShared
      ? `Flower ID ${name}: ${referralLink}`
      : `Вот мой Flower ID. Здесь мой стиль, палитра и подсказки, что лучше не дарить: ${referralLink}`;
    if (navigator.share) {
      await navigator.share({ title: "Мой цветочный портрет", text, url: publicLink });
      track("share_clicked", { submissionId, shareType: "web_share" });
    } else {
      await copy(text, "share_clicked");
    }
  };

  return (
    <section className="screen result-screen">
      {requestId && context === "own" && (
        <article className="message-card">
          <strong>Flower ID готов</strong>
          <p>Теперь можно отправить его тому, кто запросил, чтобы он подобрал букет в вашем стиле.</p>
        </article>
      )}
      <p className="eyebrow">{isShared ? `Flower ID ${answers.user.name || ""}` : "Твой Flower ID"}</p>
      {submissionId && <span className="flower-id-pill">{formatFlowerId(submissionId)}</span>}
      <h1>{profile.title}</h1>
      <div className={`archetype-photo archetype-${profile.primary_archetype}`} aria-label={`Визуал архетипа ${profile.title}`} />
      <p className="lead">{profile.description}</p>
      <div className="result-grid">
        <ResultBlock title="Идеальные оттенки" items={profile.preferred_colors} />
        <ResultBlock title="Ваши цветы" items={profile.favorite_flowers} fallback="Подберем по выбранному стилю" />
        <ResultBlock title="Лучший формат" items={[profile.format]} />
        <ResultBlock title="Лучше избегать" items={[...profile.avoid_flowers, ...profile.avoid_colors, ...hardNo]} fallback="Жесткого стоп-листа нет" />
        <ResultBlock title="Главная эмоция" items={profile.emotion} />
      </div>
      <article className="share-block">
        <h2>{isShared ? "Что можно сделать" : "Поделись своим Flower ID"}</h2>
        <p>{isShared ? "Можно подобрать букет по этому профилю или создать собственный Flower ID." : "Отправь ссылку тому, кто дарит тебе цветы, чтобы следующий букет был точно в твоем стиле."}</p>
        <div className="action-stack compact-actions">
          <button className="primary-button" onClick={share}>{requestId && !isShared ? `Отправить мой Flower ID${answers.user.name ? "" : ""}` : "Отправить"}</button>
          <button className="secondary-button" onClick={() => copy(referralLink, "copy_link_clicked")}>Скопировать ссылку</button>
        </div>
      </article>
      <div className="action-stack">
        <button className="ghost-button" onClick={() => openOrder(orderMessage, { submissionId, requestId, archetypeId: profile.primary_archetype })}>
          {isShared ? `Подобрать букет ${answers.user.name ? `для ${answers.user.name}` : "по Flower ID"}` : "Подобрать букет по моему Flower ID"}
        </button>
        <button className="secondary-button" onClick={() => copy(copyText, "profile_copied")}>Скопировать мой Flower ID</button>
        {!isShared && onEdit && <button className="secondary-button" onClick={onEdit}>Редактировать Flower ID</button>}
        {!isShared && <button className="secondary-button" onClick={() => navigate("/my-flower-id")}>Мои Flower ID</button>}
        <button className="secondary-button" onClick={() => {
          track("request_flower_id_clicked", { source: "result", submissionId });
          navigate("/request");
        }}>Запросить Flower ID у другого человека</button>
        {isShared && <button className="secondary-button" onClick={() => {
          track("shared_result_create_own_clicked", { referrerId: submissionId });
          navigate(`/?ref=${encodeURIComponent(submissionId)}`);
        }}>Создать свой Flower ID</button>}
        <button className="text-button" onClick={onRestart}>Пройти заново</button>
      </div>
    </section>
  );
}

function ResultBlock({ title, items, fallback }: { title: string; items: string[]; fallback?: string }) {
  const values = items.filter(Boolean);
  return (
    <article className="result-block">
      <span>{title}</span>
      <p>{values.length ? values.join(", ") : fallback}</p>
    </article>
  );
}

function FieldSet({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: Option[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="field-group">
      <legend>{title}</legend>
      <div className="stacked-options">
        {options.map((option) => (
          <button key={option.id} className={selected === option.id ? "selected" : ""} onClick={() => onSelect(option.id)} type="button">
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MultiField({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="field-group">
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.map((option) => (
          <button key={option.id} className={selected.includes(option.id) ? "selected" : ""} onClick={() => onToggle(option.id)} type="button">
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function QuizNav({
  step,
  onBack,
  onNext,
  nextDisabled,
  nextLabel,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  nextLabel: string;
}) {
  return (
    <nav className="quiz-nav" aria-label="Навигация по квизу">
      <button className="secondary-button" type="button" onClick={onBack} disabled={step === 1}>
        Назад
      </button>
      <button className="primary-button" type="button" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </button>
    </nav>
  );
}

function validateStep(step: number, answers: Answers) {
  if (step === 1 && answers.bouquet_swipes.length < 5) return "Оцени хотя бы 5 букетов — этого хватит для профиля.";
  if (step === 2 && answers.mood.length < 1) return "Выберите хотя бы одно настроение.";
  if (step === 6 && !answers.packaging.length) return "Выберите подачу или доверие флористу.";
  if (step === 7 && !answers.user.name.trim()) return "Добавьте имя, чтобы красиво подписать портрет.";
  return "";
}

function stepEventPayload(step: number, answers: Answers) {
  if (step === 1) return { rated_count: answers.bouquet_swipes.length };
  if (step === 2) return { selected_count: answers.mood.length };
  if (step === 3) return { selected_count: answers.favorite_palettes.length };
  if (step === 4) return { reacted_count: Object.keys(answers.flowers).length };
  if (step === 5) return { stoplist_count: answers.packaging_stoplist.length, allergy: answers.allergies.kind };
  if (step === 6) return { selected_count: answers.packaging.length, size: answers.size };
  if (step === 7) return { has_name: Boolean(answers.user.name.trim()) };
  return {};
}

function paletteState(answers: Answers, id: string) {
  if (answers.rejected_palettes.includes(id)) return "rejected";
  if (answers.ideal_palette === id) return "ideal";
  if (answers.favorite_palettes.includes(id)) return "favorite";
  return "";
}

function toggle(items: string[], id: string, max?: number) {
  if (items.includes(id)) return items.filter((item) => item !== id);
  if (max && items.length >= max) return items;
  return [...items, id];
}

function flowerReactionLabel(reaction: FlowerReaction) {
  return {
    love: "Люблю",
    neutral: "Нормально",
    dislike: "Не люблю",
    forbidden: "Нельзя",
  }[reaction];
}

function bouquetPhotoStyle(index: number) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    backgroundImage: "url('/assets/bouquet-sprite.png')",
    backgroundSize: "300% 400%",
    backgroundPosition: `${column * 50}% ${row * (100 / 3)}%`,
  };
}

function flowerPhotoStyle(index: number) {
  const column = index % 5;
  const row = Math.floor(index / 5);
  return {
    backgroundImage: "url('/assets/flower-sprite.png')",
    backgroundSize: "500% 500%",
    backgroundPosition: `${column * 25}% ${row * 25}%`,
  };
}

function flowerSubtitle(id: string) {
  const subtitles: Record<string, string> = {
    rose: "классика, жест, романтика",
    garden_rose: "мягкая форма и премиальность",
    tulip: "легкость и весеннее настроение",
    hydrangea: "объем и нежная фактура",
    chrysanthemum: "стойкость и плотный цвет",
    peony: "садовая романтика",
    ranunculus: "воздушные лепестки",
    anemone: "стильный графичный акцент",
    sweet_pea: "тонкая нежность",
    matthiola: "аромат и садовое чувство",
    orchid: "экзотика и чистая линия",
    anthurium: "смелый дизайнерский акцент",
    calla: "лаконичная элегантность",
    protea: "арт-объем и характер",
    amaryllis: "крупный вечерний цветок",
    daisy: "натуральность и простота",
    delphinium: "высота и садовая свобода",
    astilbe: "дымчатая мягкая фактура",
    scabiosa: "полевой деликатный акцент",
    eucalyptus: "зелень, воздух и свежесть",
    lily: "ароматный выразительный цветок",
    carnation: "графика и стойкость",
    gerbera: "яркость и простое настроение",
    alstroemeria: "стойкая цветная деталь",
    gypsophila: "облако мелких цветов",
  };
  return subtitles[id] ?? "цветочный акцент";
}

function encodeRequestToken(request: FlowerRequest) {
  const payload = {
    id: request.id,
    requesterName: request.requesterName,
    recipientName: request.recipientName,
    occasion: request.occasion,
    comment: request.comment,
    status: "created",
    created_at: request.created_at,
  };
  return encodeBase64Url(JSON.stringify(payload));
}

function decodeRequestToken(token: string): FlowerRequest | null {
  try {
    const decoded = JSON.parse(decodeBase64Url(token)) as Partial<FlowerRequest>;
    if (!decoded.id || !decoded.recipientName || !decoded.created_at) return null;
    return {
      id: decoded.id,
      requesterName: decoded.requesterName || "",
      recipientName: decoded.recipientName,
      occasion: decoded.occasion || "",
      comment: decoded.comment || "",
      status: decoded.status || "created",
      created_at: decoded.created_at,
      opened_at: decoded.opened_at,
      started_at: decoded.started_at,
      completed_at: decoded.completed_at,
      submissionId: decoded.submissionId,
    };
  } catch {
    return null;
  }
}

function createPublicLink(answers: Answers, profile: ReturnType<typeof computeProfile>, submissionId?: string) {
  const payload = {
    ...getPublicPayload(answers, profile),
    flower_id: submissionId ? formatFlowerId(submissionId) : undefined,
  };
  return `${window.location.origin}/p/${encodeBase64Url(JSON.stringify(payload))}`;
}

function readPublicPayload() {
  if (!window.location.pathname.startsWith("/p/")) return null;
  try {
    const raw = window.location.pathname.split("/p/")[1];
    return JSON.parse(decodeBase64Url(raw)) as {
      name: string;
      flower_id?: string;
      title: string;
      description: string;
      preferred_colors: string[];
      favorite_flowers: string[];
      avoid_flowers: string[];
      preferred_format: string;
    };
  } catch {
    return null;
  }
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function editSavedFlowerId(submission: FlowerSubmission, navigate: (url: string) => void) {
  resetStorage();
  saveAnswers(structuredClone(submission.answers));
  saveStep(1);
  startEditingSubmission(submission.id);
  sessionStorage.setItem(activeQuizKey, "1");
  track("saved_flower_id_edit_clicked", { submissionId: submission.id });
  navigate("/");
}

function formatFlowerId(id: string) {
  return `FID-${id.replace(/^fid_/, "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function createId(prefix: string) {
  if ("crypto" in window && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function openShare(text: string, url: string, eventName: string) {
  const canShare = typeof navigator.share === "function";
  track(eventName, { shareType: canShare ? "web_share" : "copy" });
  if (canShare) {
    await navigator.share({ title: "Flower ID", text, url });
    return;
  }
  await navigator.clipboard.writeText(text);
}

function buildOrderMessage(answers: Answers, profile: ComputedProfile, link: string, requestId?: string | null) {
  const recipient = answers.user.name || "не указано";
  return [
    requestId
      ? "Здравствуйте! Я запросил Flower ID у получателя и хочу заказать букет по результату."
      : "Здравствуйте! Хочу подобрать букет по Flower ID.",
    "",
    `Получатель: ${recipient}`,
    `Flower ID: ${profile.title}`,
    `Ссылка: ${link}`,
    requestId ? `Request ID: ${requestId}` : "",
    "",
    "Помогите подобрать 3 варианта букета под этот стиль.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function openOrder(
  prefilledMessage: string,
  payload: { submissionId: string; requestId?: string | null; archetypeId: string },
) {
  track("order_clicked", {
    submissionId: payload.submissionId,
    requestId: payload.requestId,
    archetypeId: payload.archetypeId,
    channel: "telegram",
  });
  const telegramBase = "https://t.me/share/url";
  const url = `${telegramBase}?text=${encodeURIComponent(prefilledMessage)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function exportCsv(answers: Answers, profile: ReturnType<typeof computeProfile>) {
  const row = {
    name: answers.user.name,
    telegram: answers.user.telegram,
    primary_archetype: profile.primary_archetype,
    secondary_archetype: profile.secondary_archetype ?? "",
    title: profile.title,
    favorite_palettes: profile.preferred_colors.join("; "),
    favorite_flowers: profile.favorite_flowers.join("; "),
    avoid_flowers: profile.avoid_flowers.join("; "),
    allergies: answers.allergies.comment,
    animals: answers.home_conditions.join("; "),
    size: answers.size,
    fragrance: answers.fragrance,
    packaging: answers.packaging.join("; "),
    florist_brief: profile.florist_brief.replace(/\n/g, " | "),
  };
  const headers = Object.keys(row);
  const values = Object.values(row).map((value) => `"${String(value).replace(/"/g, '""')}"`);
  download("flower-portrait.csv", `${headers.join(",")}\n${values.join(",")}`, "text/csv;charset=utf-8");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
