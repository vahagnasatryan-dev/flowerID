import { useEffect, useMemo, useRef, useState } from "react";
import {
  allergyOptions,
  bouquetCards,
  flowerGroups,
  fragranceOptions,
  longevityOptions,
  moods,
  packagingOptions,
  packagingStopOptions,
  palettes,
  totalSteps,
} from "./data";
import { computeProfile, getBouquetHardNo, getPublicPayload } from "./scoring";
import {
  flushCollectorQueue,
  loadAnswers,
  loadFlowerRequest,
  loadStep,
  loadSubmission,
  resetStorage,
  saveAnswers,
  saveFlowerRequest,
  saveStep,
  saveSubmission,
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
  "swipes",
  "mood",
  "palette",
  "flowers",
  "size",
  "practical",
  "packaging",
  "associations",
  "result",
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
  if (path.startsWith("/r/")) return <RecipientRequestPage requestId={decodeURIComponent(path.split("/r/")[1] || "")} navigate={navigate} />;
  if (path.startsWith("/result/")) return <StoredResultPage submissionId={decodeURIComponent(path.split("/result/")[1] || "")} navigate={navigate} />;
  if (path === "/" && quizActive) return <QuizApp navigate={navigate} onExit={() => setQuizActive(false)} />;
  return <LandingPage navigate={navigate} startQuiz={() => setQuizActive(true)} key={routeKey} />;
}

function QuizApp({ navigate, onExit }: { navigate: (url: string) => void; onExit: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const referrerId = params.get("ref");
  const requestId = params.get("requestId");
  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(defaultAnswers));
  const [step, setStep] = useState(() => Math.min(loadStep(), totalSteps - 1));
  const [toast, setToast] = useState("");
  const profile = useMemo(() => computeProfile(answers), [answers]);
  const progress = Math.round((step / (totalSteps - 1)) * 100);

  useEffect(() => {
    saveAnswers(answers);
  }, [answers]);

  useEffect(() => {
    saveStep(step);
    track("step_viewed", { step: stepNames[step], progress });
  }, [step, progress]);

  const patchAnswers = (patch: Partial<Answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
  };

  const next = () => {
    const message = validateStep(step, answers);
    if (message) {
      showToast(message);
      return;
    }
    if (step === 0) track("quiz_started");
    if (step === 8) {
      track("quiz_completed", { primary_archetype: profile.primary_archetype, requestId, referrerId });
      const id = createId("fid");
      const submission: FlowerSubmission = {
        id,
        created_at: new Date().toISOString(),
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
      sessionStorage.removeItem(activeQuizKey);
      onExit();
      navigate(`/result/${id}${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ""}`);
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
    sessionStorage.removeItem(activeQuizKey);
    onExit();
    setAnswers(freshAnswers);
    setStep(0);
    saveAnswers(freshAnswers);
    saveStep(0);
    showToast("Прогресс сброшен");
  };

  const back = () => setStep((value) => (value === 6 ? 4 : Math.max(value - 1, 0)));

  const restart = () => {
    resetStorage();
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
        <Header step={step} progress={progress} onBack={back} />

        {step === 0 && <StartScreen onStart={startFresh} onReset={resetProgress} />}
        {step === 1 && (
          <SwipeScreen
            swipes={answers.bouquet_swipes}
            onReact={(cardId, reaction) => {
              patchAnswers({
                bouquet_swipes: [
                  ...answers.bouquet_swipes.filter((item) => item.card_id !== cardId),
                  { card_id: cardId, reaction },
                ],
              });
              track("bouquet_swiped", { card_id: cardId, reaction });
            }}
            onNext={next}
          />
        )}
        {step === 2 && (
          <ChoiceScreen
            title="Каким должен быть букет, чтобы он попал в вас?"
            hint="Выберите до 5 настроений."
            options={moods}
            selected={answers.mood}
            max={5}
            onToggle={(id) => patchAnswers({ mood: toggle(answers.mood, id, 5) })}
            onNext={() => {
              track("mood_selected", { selected_count: answers.mood.length });
              next();
            }}
          />
        )}
        {step === 3 && (
          <PaletteScreen
            answers={answers}
            onChange={patchAnswers}
            onNext={() => {
              track("palette_selected", { selected_count: answers.favorite_palettes.length });
              next();
            }}
          />
        )}
        {step === 4 && (
          <FlowersScreen
            flowers={answers.flowers}
            onChange={(flowers) => patchAnswers({ flowers })}
            onNext={() => {
              track("flower_reacted", { reacted_count: Object.keys(answers.flowers).length });
              setStep(6);
            }}
          />
        )}
        {step === 6 && (
          <PracticalScreen
            answers={answers}
            onChange={patchAnswers}
            onNext={() => {
              track("practical_details_completed");
              next();
            }}
          />
        )}
        {step === 7 && (
          <PackagingScreen
            answers={answers}
            onChange={patchAnswers}
            onNext={() => {
              track("packaging_selected", { selected_count: answers.packaging.length });
              next();
            }}
          />
        )}
        {step === 8 && <AssociationsScreen answers={answers} onChange={patchAnswers} onNext={next} />}
        {step === 9 && (
          <ResultScreen
            answers={answers}
            profile={profile}
            context="own"
            submissionId=""
            requestId={requestId}
            navigate={navigate}
            onRestart={restart}
            onToast={showToast}
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
    resetStorage();
    saveAnswers(structuredClone(defaultAnswers));
    saveStep(1);
    sessionStorage.setItem(activeQuizKey, "1");
    track("start_quiz_clicked");
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
              <h1>Создай свой Flower ID</h1>
              <p className="lead">
                Узнай свой цветочный стиль и получай букеты, которые действительно тебе подходят.
              </p>
              <p className="subtle">
                За пару минут соберем палитру, любимые цветы и стоп-лист.
              </p>
              <div className="hero-actions landing-actions">
                <button className="primary-button" onClick={start}>Создать Flower ID</button>
                <button className="secondary-button" onClick={() => {
                  track("request_flower_id_clicked", { source: "landing" });
                  navigate("/request");
                }}>Запросить Flower ID у другого человека</button>
              </div>
            </div>
            <div className="landing-flower" aria-hidden="true" />
          </div>
          <p className="landing-benefit">
            С Flower ID близким проще выбрать идеальный букет, а тебе — приятнее получать цветы, которые действительно про тебя
          </p>
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
        <Header step={9} progress={100} onBack={() => navigate("/")} />
        <ResultScreen
          answers={submission.answers}
          profile={submission.computed_profile}
          context={isShared ? "shared" : "own"}
          submissionId={submission.id}
          requestId={requestId}
          navigate={navigate}
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

function RequestPage({ navigate }: { navigate: (url: string) => void }) {
  const [form, setForm] = useState({ recipientName: "", requesterName: "", occasion: "", comment: "" });
  const [created, setCreated] = useState<FlowerRequest | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    track("request_started");
  }, []);

  const requestLink = created ? `${window.location.origin}/r/${created.id}` : "";
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
          <Header step={0} progress={0} onBack={() => navigate("/")} />
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
        <Header step={0} progress={0} onBack={() => navigate("/")} />
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
            track("request_created", { requestId: request.id, recipientName: request.recipientName });
          }}>Создать ссылку-запрос</button>
        </section>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function RecipientRequestPage({ requestId, navigate }: { requestId: string; navigate: (url: string) => void }) {
  const request = loadFlowerRequest(requestId);

  useEffect(() => {
    if (!request) return;
    saveFlowerRequest({ ...request, status: request.status === "created" ? "opened" : request.status, opened_at: request.opened_at ?? new Date().toISOString() });
    track("request_link_opened", { requestId });
  }, [request, requestId]);

  if (!request) {
    return <EmptyState title="Запрос не найден" text="Возможно, ссылка устарела. Можно создать свой Flower ID." action="Создать Flower ID" onAction={() => navigate("/")} />;
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} progress={0} onBack={() => navigate("/")} />
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

function Header({ step, progress, onBack }: { step: number; progress: number; onBack: () => void }) {
  if (step === 0) {
    return (
      <header className="topbar start-topbar">
        <span className="brand-mark">Flower ID</span>
        <span className="start-topbar-note">3 минуты · без скучной анкеты</span>
      </header>
    );
  }

  const microcopy =
    step < 2
      ? "Ваш портрет только раскрывается"
      : step < 4
        ? "Палитра начинает проявляться"
        : step < 7
          ? "Мы уже чувствуем ваш стиль"
          : step < 9
            ? "Финальные штрихи"
            : "Портрет готов";

  return (
    <header className="topbar">
      <button className="icon-button" onClick={onBack} disabled={step === 0} aria-label="Назад">
        <span aria-hidden="true">‹</span>
      </button>
      <div className="progress-wrap" aria-label={`Готово ${progress}%`}>
        <span>{microcopy}</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <span className="step-count">{progress}%</span>
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
  onNext,
}: {
  swipes: Answers["bouquet_swipes"];
  onReact: (cardId: string, reaction: Reaction) => void;
  onNext: () => void;
}) {
  const index = Math.min(swipes.length, bouquetCards.length - 1);
  const current = bouquetCards[index];
  const completed = swipes.length >= bouquetCards.length;
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const swipeCommitted = useRef(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    swipeCommitted.current = false;
    setDrag({ x: 0, y: 0, active: false });
  }, [current.id]);

  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(onNext, 520);
    return () => window.clearTimeout(timer);
  }, [completed, onNext]);

  const react = (reaction: Reaction) => {
    if (!completed && !swipeCommitted.current) {
      swipeCommitted.current = true;
      onReact(current.id, reaction);
    }
  };

  const finishSwipe = (dx: number, dy: number) => {
    dragStart.current = null;
    setDrag({ x: 0, y: 0, active: false });
    if (Math.abs(dx) < 58 && Math.abs(dy) < 58) return;
    if (Math.abs(dx) > Math.abs(dy)) react(dx > 0 ? "like" : "dislike");
    else react(dy < 0 ? "love" : "hard_no");
  };

  return (
    <section className="screen">
      <p className="eyebrow">Визуальный стиль</p>
      <h2>Выберите букеты, которые вам нравятся</h2>
      <p className="hint">Потяните карточку в сторону реакции. Можно двигать быстро: как только жест понятен, появится следующий букет.</p>
      <div className="swipe-coach" aria-label="Направления свайпа">
        <span className="coach-pill coach-top">Вау</span>
        <span className="coach-pill coach-left">Не мое</span>
        <div className="coach-card">
          <span>Потяните</span>
        </div>
        <span className="coach-pill coach-right">Нравится</span>
        <span className="coach-pill coach-bottom">Точно нет</span>
      </div>
      <div className="swipe-area">
        {!completed ? (
          <article
            className="bouquet-card"
            style={{
              ...bouquetPhotoStyle(index),
              transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`,
              transition: drag.active ? "none" : "transform 180ms ease",
            }}
            onPointerDown={(event) => {
              dragStart.current = { x: event.clientX, y: event.clientY };
              setDrag({ x: 0, y: 0, active: true });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragStart.current) return;
              event.preventDefault();
              if (swipeCommitted.current) return;
              const dx = event.clientX - dragStart.current.x;
              const dy = event.clientY - dragStart.current.y;
              setDrag({
                x: dx,
                y: dy,
                active: true,
              });
              if (Math.max(Math.abs(dx), Math.abs(dy)) > 130) {
                finishSwipe(dx, dy);
              }
            }}
            onPointerUp={(event) => {
              if (!dragStart.current) return;
              const dx = event.clientX - dragStart.current.x;
              const dy = event.clientY - dragStart.current.y;
              finishSwipe(dx, dy);
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              setDrag({ x: 0, y: 0, active: false });
            }}
          >
            <div>
              <span className="card-number">
                {index + 1} / {bouquetCards.length}
              </span>
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
  onNext,
}: {
  title: string;
  hint: string;
  options: Option[];
  selected: string[];
  max?: number;
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <section className="screen">
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
      <button className="primary-button" onClick={onNext}>Дальше</button>
    </section>
  );
}

function PaletteScreen({
  answers,
  onChange,
  onNext,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onNext: () => void;
}) {
  const markPalette = (id: string, mode: "favorite" | "ideal" | "reject" | "clear") => {
    const favorite_palettes = answers.favorite_palettes.filter((item) => item !== id);
    const rejected_palettes = answers.rejected_palettes.filter((item) => item !== id);
    if (mode === "clear") {
      onChange({ favorite_palettes, rejected_palettes, ideal_palette: answers.ideal_palette === id ? "" : answers.ideal_palette });
    }
    if (mode === "favorite") onChange({ favorite_palettes: [...favorite_palettes, id], rejected_palettes });
    if (mode === "ideal")
      onChange({ ideal_palette: answers.ideal_palette === id ? "" : id, favorite_palettes: [...favorite_palettes, id], rejected_palettes });
    if (mode === "reject")
      onChange({ rejected_palettes: [...rejected_palettes, id], favorite_palettes, ideal_palette: answers.ideal_palette === id ? "" : answers.ideal_palette });
  };

  return (
    <section className="screen">
      <p className="eyebrow">Палитра</p>
      <h2>Какие оттенки вам ближе?</h2>
      <p className="hint">Посмотрите оттенки и выберите одну из трех реакций для каждой палитры.</p>
      <div className="palette-board">
        {palettes.map((palette) => (
          <article key={palette.id} className={`palette-tile ${paletteState(answers, palette.id)}`}>
            <div className="palette-main">
              <div className="swatches">
                {palette.colors?.map((color) => <i key={color} style={{ background: color }} />)}
              </div>
              <span>{palette.label}</span>
              <small>{palette.description}</small>
            </div>
            <div className="palette-actions">
              <button onClick={() => markPalette(palette.id, "ideal")} className={answers.ideal_palette === palette.id ? "active" : ""}>Идеально</button>
              <button onClick={() => markPalette(palette.id, "favorite")} className={answers.favorite_palettes.includes(palette.id) && answers.ideal_palette !== palette.id ? "active" : ""}>Нравится</button>
              <button onClick={() => markPalette(palette.id, "reject")} className={answers.rejected_palettes.includes(palette.id) ? "danger active" : ""}>Не мое</button>
            </div>
          </article>
        ))}
      </div>
      <button className="primary-button" onClick={onNext}>Дальше</button>
    </section>
  );
}

function FlowersScreen({
  flowers,
  onChange,
  onNext,
}: {
  flowers: Answers["flowers"];
  onChange: (flowers: Answers["flowers"]) => void;
  onNext: () => void;
}) {
  const setReaction = (id: string, reaction: FlowerReaction) => onChange({ ...flowers, [id]: reaction });
  return (
    <section className="screen">
      <p className="eyebrow">Цветочный кастинг</p>
      <h2>Кого берем в ваш букет?</h2>
      <p className="hint">Отметьте цветы, которые любите, и те, которые точно не стоит использовать.</p>
      {flowerGroups.map((group, groupIndex) => (
        <div className="flower-group" key={group.title}>
          <div className="flower-list">
            {group.flowers.map((flower, flowerIndex) => {
              const photoIndex = groupIndex * 5 + flowerIndex;
              return (
              <article key={flower.id} className="flower-card">
                <div className="flower-photo" style={flowerPhotoStyle(photoIndex)} aria-hidden="true" />
                <div className="flower-copy">
                  <strong>{flower.label}</strong>
                  <span>{flowerSubtitle(flower.id)}</span>
                </div>
                <div className="flower-actions">
                  {(["love", "neutral", "dislike", "forbidden"] as FlowerReaction[]).map((reaction) => (
                    <button
                      key={reaction}
                      className={flowers[flower.id] === reaction ? "active" : ""}
                      onClick={() => setReaction(flower.id, reaction)}
                    >
                      {flowerReactionLabel(reaction)}
                    </button>
                  ))}
                </div>
              </article>
              );
            })}
          </div>
        </div>
      ))}
      <button className="primary-button" onClick={onNext}>Дальше</button>
    </section>
  );
}

function PracticalScreen({
  answers,
  onChange,
  onNext,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onNext: () => void;
}) {
  const setAllergy = (id: string) => {
    onChange({
      allergies: {
        has_allergy: id !== "none",
        kind: id,
        comment: id === "none" ? "" : answers.allergies.comment,
      },
    });
  };

  return (
    <section className="screen">
      <p className="eyebrow">Практичные детали</p>
      <h2>Пара практичных деталей</h2>
      <p className="hint">Чтобы букет был не только красивым, но и комфортным.</p>
      <FieldSet title="Аромат" options={fragranceOptions} selected={answers.fragrance} onSelect={(fragrance) => onChange({ fragrance })} />
      <FieldSet title="Стойкость" options={longevityOptions} selected={answers.longevity} onSelect={(longevity) => onChange({ longevity })} />
      <FieldSet title="Аллергии" options={allergyOptions} selected={answers.allergies.kind} onSelect={setAllergy} />
      {answers.allergies.has_allergy && (
        <textarea
          className="text-area"
          placeholder="Если хотите, уточните аллергию или ограничения"
          value={answers.allergies.comment}
          onChange={(event) => onChange({ allergies: { ...answers.allergies, comment: event.target.value } })}
        />
      )}
      <button className="primary-button" onClick={onNext}>Дальше</button>
    </section>
  );
}

function PackagingScreen({
  answers,
  onChange,
  onNext,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onNext: () => void;
}) {
  return (
    <section className="screen">
      <p className="eyebrow">Подача</p>
      <h2>Как вам приятнее получить букет?</h2>
      <MultiField title="Варианты подачи" options={packagingOptions} selected={answers.packaging} onToggle={(id) => onChange({ packaging: toggle(answers.packaging, id) })} />
      <MultiField title="Что точно не ваше?" options={packagingStopOptions} selected={answers.packaging_stoplist} onToggle={(id) => onChange({ packaging_stoplist: toggle(answers.packaging_stoplist, id) })} />
      <button className="primary-button" onClick={onNext}>Дальше</button>
    </section>
  );
}

function AssociationsScreen({
  answers,
  onChange,
  onNext,
}: {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onNext: () => void;
}) {
  return (
    <section className="screen">
      <p className="eyebrow">Финальные штрихи</p>
      <h2>Комментарий для флориста</h2>
      <p className="hint">Напишите любой комментарий, который поможет собрать для вас идеальный букет.</p>
      <textarea
        className="text-area note-input"
        placeholder="Например: люблю свободную форму, без сильного запаха, лучше нежно и не слишком торжественно"
        value={answers.personal_note}
        onChange={(event) => onChange({ personal_note: event.target.value })}
      />
      <div className="contact-panel">
        <label>
          Имя
          <input value={answers.user.name} onChange={(event) => onChange({ user: { ...answers.user, name: event.target.value } })} placeholder="Анна" />
        </label>
        <label>
          Телефон или Telegram
          <input
            value={answers.user.telegram || answers.user.phone}
            onChange={(event) => onChange({ user: { ...answers.user, telegram: event.target.value } })}
            placeholder="@username"
          />
        </label>
      </div>
      <button className="primary-button" onClick={onNext}>Собрать портрет</button>
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
  onRestart,
  onToast,
}: {
  answers: Answers;
  profile: ComputedProfile;
  context: "own" | "shared";
  submissionId: string;
  requestId?: string | null;
  navigate: (url: string) => void;
  onRestart: () => void;
  onToast: (message: string) => void;
}) {
  const publicLink = `${window.location.origin}/result/${submissionId}`;
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
        <button className="secondary-button" onClick={() => copy(copyText, "profile_copied")}>Сохранить мой Flower ID</button>
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

function validateStep(step: number, answers: Answers) {
  if (step === 1 && answers.bouquet_swipes.length < bouquetCards.length) return "Разберите все 12 букетов, чтобы мы точнее поняли стиль.";
  if (step === 2 && answers.mood.length < 1) return "Выберите хотя бы одно настроение.";
  if (step === 3 && !answers.favorite_palettes.length && !answers.ideal_palette && !answers.rejected_palettes.length) return "Отметьте хотя бы одну палитру.";
  if (step === 4 && !Object.keys(answers.flowers).length) return "Отметьте хотя бы один цветок.";
  if (step === 6 && (!answers.fragrance || !answers.longevity)) return "Выберите аромат и стойкость.";
  if (step === 7 && !answers.packaging.length) return "Выберите подачу или доверие флористу.";
  if (step === 8 && !answers.user.name.trim()) return "Добавьте имя, чтобы красиво подписать портрет.";
  return "";
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

function createPublicLink(answers: Answers, profile: ReturnType<typeof computeProfile>) {
  const payload = getPublicPayload(answers, profile);
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const encoded = btoa(String.fromCharCode(...bytes));
  return `${window.location.origin}/p/${encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function readPublicPayload() {
  if (!window.location.pathname.startsWith("/p/")) return null;
  try {
    const raw = window.location.pathname.split("/p/")[1];
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as {
      name: string;
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
