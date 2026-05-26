import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  bouquetCards,
  moods,
  packagingOptions,
  packagingStopOptions,
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
  loadFlowerOrders,
  loadFlowerRequests,
  loadGiftBouquetOptions,
  loadGiftRequest,
  loadGiftRequests,
  loadStep,
  loadSubmission,
  loadSubmissions,
  resetStorage,
  saveAnswers,
  saveFlowerOrder,
  saveFlowerRequest,
  saveGiftBouquetOptions,
  saveGiftRequest,
  saveResultFeedback,
  saveStep,
  saveSubmission,
  sendCollectorDebugRecord,
  startEditingSubmission,
  syncFlowerRequestStatus,
  syncGiftBouquetOptions,
  syncGiftRequests,
  track,
} from "./storage";
import type { Answers, ArchetypeId, ComputedProfile, FlowerOrder, FlowerRequest, FlowerReaction, FlowerSubmission, GiftBouquetProposal, GiftRequest, Option, Reaction } from "./types";

type OrderDraft = {
  budget: string;
  occasion: string;
  deliveryDate: string;
  deliveryDetails: string;
  senderName: string;
  senderContact: string;
  comment: string;
};

type GiftStep = "recipient" | "occasion" | "effect" | "taste" | "budget" | "result" | "final";

type GiftOption = {
  id: string;
  label: string;
  description?: string;
};

type GiftStyleId = "garden_romance" | "quiet_luxury" | "bright_joy" | "business_elegance" | "wow_drama" | "warm_classic";

type GiftBouquetOption = GiftBouquetProposal;

type GiftRecommendation = {
  styleId: GiftStyleId;
  styleName: string;
  description: string;
  flowers: string[];
  avoid: string[];
  image: string;
  options: GiftBouquetOption[];
};

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
const activeGiftRequestKey = "flower_id_active_gift_request";
const orderTelegramUrl = "https://t.me/flowerid_order";

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

  if (publicPayload) return <PublicProfile payload={publicPayload} navigate={navigate} />;

  const path = window.location.pathname;
  if (path === "/quiz") {
    const target = `/${window.location.search}`;
    window.history.replaceState({}, "", target);
    return <LandingPage navigate={navigate} startQuiz={() => setQuizActive(true)} key={routeKey} />;
  }
  if (path === "/request") return <RequestPage navigate={navigate} />;
  if (path === "/gift") return <GiftConciergePage navigate={navigate} />;
  if (path === "/gift-admin") return <GiftAdminPage navigate={navigate} />;
  if (path.startsWith("/request-status/")) return <RequestStatusPage requestId={decodeURIComponent(path.split("/request-status/")[1] || "")} navigate={navigate} />;
  if (path.startsWith("/order-next/")) return <OrderNextStepsPage orderId={decodeURIComponent(path.split("/order-next/")[1] || "")} navigate={navigate} />;
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
  navigate,
}: {
  payload: {
    name: string;
    archetype_id?: ArchetypeId;
    flower_id?: string;
    title: string;
    description: string;
    preferred_colors: string[];
    favorite_flowers: string[];
    avoid_flowers: string[];
    preferred_format: string;
  };
  navigate: (url: string) => void;
}) {
  const requestId = new URLSearchParams(window.location.search).get("requestId");
  const archetypeId = payload.archetype_id ?? findArchetypeByTitle(payload.title);
  const defaults = archetypeResultDefaults[archetypeId];
  const publicName = payload.name || "Получатель";
  const palette = payload.preferred_colors.length
    ? payload.preferred_colors.slice(0, 5).map((name, index) => ({
      name,
      color: defaults.palette[index % defaults.palette.length]?.color ?? "#d9cec2",
    }))
    : defaults.palette;

  return (
    <main className="app-shell">
      <section className="quiz-frame public-frame">
        <div className="screen result-screen premium-result-screen public-result-screen">
          <header className="result-brand-header">
            <span className="brand-mark">Flower ID</span>
            <span>для букетов без ошибок</span>
          </header>
          <ResultHero
            name={publicName}
            archetypeName={defaults.name}
            title={payload.name ? `Flower ID ${payload.name}` : "Flower ID готов"}
            subtitle={`Теперь понятно, какой букет действительно подходит для ${publicName}.`}
            description={makePublicResultText(payload.description)}
            tags={defaults.tags}
            submissionId={payload.flower_id ?? ""}
          />
          <ArchetypeVisualReferences visuals={defaults.visuals} name={publicName} isShared />
          <section className="flower-id-profile-card">
            <ProfileSection title="Палитра Flower ID">
              <PaletteSwatches palette={palette} />
            </ProfileSection>
            <ProfileSection title="Подойдут к этому Flower ID">
              <ChipList items={payload.favorite_flowers} fallback="Флорист подберёт цветы по стилю." />
            </ProfileSection>
            <ProfileSection title="Лучше не дарить" tone="warning">
              <ChipList items={payload.avoid_flowers} fallback="Жёсткого стоп-листа нет." />
            </ProfileSection>
            <ProfileSection title="Формат">
              <p>{payload.preferred_format}</p>
            </ProfileSection>
          </section>
          <PublicOrderPanel payload={payload} archetypeId={archetypeId} requestId={requestId} navigate={navigate} />
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
              <p className="eyebrow">Flower ID</p>
              <h1>Букеты без догадок</h1>
              <p className="lead">
                Flower ID помогает понять вкус человека, подобрать букет под ситуацию и оформить заказ без риска ошибиться.
              </p>
              <div className="landing-paths" aria-label="Сценарии Flower ID">
                <button className="landing-path-card primary-path" onClick={start}>
                  <span>Для себя</span>
                  <strong>Создать мой Flower ID</strong>
                  <p>Чтобы близким было проще дарить тебе букеты, которые действительно подходят.</p>
                </button>
                <button className="landing-path-card" onClick={() => {
                  track("gift_concierge_link_clicked", { source: "landing" });
                  navigate("/gift");
                }}>
                  <span>Для подарка</span>
                  <strong>Подобрать букет</strong>
                  <p>Для конкретного человека, повода, эмоции и бюджета. Получите 3 персональных варианта.</p>
                </button>
                <button className="landing-path-card" onClick={() => {
                  track("request_flower_id_clicked", { source: "landing" });
                  navigate("/request");
                }}>
                  <span>Для близкого</span>
                  <strong>Узнать Flower ID другого человека</strong>
                  <p>Отправьте красивую ссылку, а потом закажите букет по готовому профилю.</p>
                </button>
              </div>
              <div className="hero-actions landing-actions">
                <p className="cta-note">2–3 минуты · без регистрации · заказ через Telegram</p>
                <button className="landing-my-link" onClick={() => navigate("/my-flower-id")}>Мои сохраненные Flower ID</button>
              </div>
              <div className="landing-benefit">
                <strong>Создай профиль.</strong>
                <strong>Подбери подарок.</strong>
                <p>Один сервис для ситуаций, где хочется подарить красиво и уместно.</p>
              </div>
              <div className="landing-guarantees" aria-label="Гарантии Flower ID">
                <article>
                  <strong>Свежесть</strong>
                  <p>Собираем букет перед доставкой и подбираем стойкие сезонные цветы.</p>
                </article>
                <article>
                  <strong>Удобная доставка</strong>
                  <p>В Telegram уточним адрес, время и детали, чтобы всё прошло спокойно.</p>
                </article>
                <article>
                  <strong>Как на фото</strong>
                  <p>Перед отправкой согласуем внешний вид, чтобы ожидания совпали с результатом.</p>
                </article>
              </div>
            </div>
            <div className="landing-visual">
              <div className="landing-flower" aria-hidden="true" />
              <article className="flower-id-preview-card" aria-label="Пример результата Flower ID">
                <div className="preview-card-top">
                  <span>Пример результата</span>
                  <strong>Flower ID</strong>
                </div>
                <div className="preview-photo" aria-hidden="true" />
                <div className="preview-card-body">
                  <p className="preview-name">Анна — Мягкий минимализм</p>
                  <h2>Профиль, который легко отправить близким</h2>
                  <div className="preview-tags" aria-label="Стиль примера">
                    <span>нежно</span>
                    <span>чисто</span>
                    <span>воздушно</span>
                  </div>
                  <div className="preview-section">
                    <strong>Палитра</strong>
                    <div className="preview-palette" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                    <p>молочный · пудровый · шалфейный</p>
                  </div>
                  <div className="preview-mini-grid">
                    <div className="preview-section">
                      <strong>Подходит</strong>
                      <p>ранункулюсы · анемоны · фрезия</p>
                    </div>
                    <div className="preview-section">
                      <strong>Не дарить</strong>
                      <p>красные розы · яркую упаковку</p>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

const giftSteps: Array<{ id: GiftStep; label: string }> = [
  { id: "recipient", label: "Кому" },
  { id: "occasion", label: "Повод" },
  { id: "effect", label: "Эффект" },
  { id: "taste", label: "Вкус" },
  { id: "budget", label: "Бюджет" },
  { id: "result", label: "Варианты" },
  { id: "final", label: "Telegram" },
];

const recipientOptions: GiftOption[] = [
  { id: "partner", label: "Девушке / жене" },
  { id: "mother", label: "Маме" },
  { id: "colleague", label: "Коллеге" },
  { id: "friend", label: "Подруге" },
  { id: "client", label: "Клиенту / партнёру" },
  { id: "teacher_doctor", label: "Учителю / врачу" },
  { id: "other", label: "Другому человеку" },
];

const tasteOptions: GiftOption[] = [
  { id: "has_flower_id", label: "У меня есть Flower ID получателя" },
  { id: "roughly_know", label: "Я знаю примерно, что нравится" },
  { id: "unknown", label: "Я не знаю вкус, помогите угадать" },
  { id: "request_flower_id", label: "Хочу запросить Flower ID" },
];

const avoidGiftOptions: GiftOption[] = [
  { id: "red_roses", label: "Красные розы" },
  { id: "lilies", label: "Лилии" },
  { id: "carnations", label: "Гвоздики" },
  { id: "dried", label: "Сухоцветы" },
  { id: "strong_scent", label: "Сильный аромат" },
  { id: "too_bright", label: "Слишком яркие цвета" },
  { id: "glitter", label: "Блёстки / стразы / декор" },
  { id: "too_much_wrap", label: "Слишком много упаковки" },
  { id: "unknown", label: "Не знаю" },
];

const budgetOptions: GiftOption[] = [
  { id: "under_5000", label: "До 5 000 ₽" },
  { id: "5000_8000", label: "5 000–8 000 ₽" },
  { id: "8000_15000", label: "8 000–15 000 ₽" },
  { id: "15000_plus", label: "15 000+ ₽" },
];

const giftStyleGuide: Record<GiftStyleId, Omit<GiftRecommendation, "styleId" | "options">> = {
  garden_romance: {
    styleName: "Нежная садовая романтика",
    description: "Мягкая форма, пастельная гамма, сезонные цветы и лёгкая естественная упаковка. Такой букет выглядит лично, тепло и не слишком торжественно.",
    flowers: ["кустовые розы", "эустома", "ранункулюсы", "маттиола", "пионы / пионовидные розы", "сезонная зелень"],
    avoid: ["ярко-красные розы", "блёстки", "тяжёлая упаковка", "слишком контрастные сочетания"],
    image: "/archetypes/garden-romance.jpg",
  },
  quiet_luxury: {
    styleName: "Тихая роскошь",
    description: "Сдержанный премиальный букет без лишнего декора: спокойная гамма, дорогая фактура и аккуратная упаковка.",
    flowers: ["каллы", "орхидеи в умеренном количестве", "антуриум", "премиальные розы", "декоративная зелень"],
    avoid: ["пестрота", "блёстки", "слишком яркая упаковка", "дешёвый декор"],
    image: "/archetypes/quiet-luxury.jpg",
  },
  bright_joy: {
    styleName: "Яркая радость",
    description: "Солнечный, живой, энергичный букет для дня рождения, поздравления и лёгкого радостного повода.",
    flowers: ["тюльпаны", "герберы", "ранункулюсы", "кустовые розы", "сезонные яркие цветы"],
    avoid: ["слишком тёмные оттенки", "тяжёлая драматичная композиция"],
    image: "/archetypes/sunny-joy.jpg",
  },
  business_elegance: {
    styleName: "Деловая элегантность",
    description: "Уместный, сдержанный и статусный букет для коллег, руководителей, клиентов и партнёров.",
    flowers: ["розы спокойных оттенков", "каллы", "орхидеи", "антуриум", "эвкалипт", "декоративная зелень"],
    avoid: ["чрезмерная романтичность", "красные розы", "блёстки", "слишком личная открытка"],
    image: "/archetypes/white-green-minimalism.jpg",
  },
  wow_drama: {
    styleName: "Вау-драма",
    description: "Эффектный, запоминающийся букет для случая, когда нужно произвести сильное впечатление.",
    flowers: ["амариллисы", "антуриум", "орхидеи", "крупные розы", "необычная зелень"],
    avoid: ["слишком простое исполнение", "дешёвая упаковка", "маленький размер"],
    image: "/archetypes/dramatic-elegance.jpg",
  },
  warm_classic: {
    styleName: "Тёплая классика",
    description: "Понятный, добрый и уютный букет для мамы, бабушки, учителя или семейного повода.",
    flowers: ["хризантемы премиального вида", "тюльпаны", "кустовые розы", "эустома", "сезонные цветы"],
    avoid: ["слишком авангардные формы", "мрачные оттенки", "чрезмерная экзотика"],
    image: "/archetypes/classic-femininity.jpg",
  },
};

function createEmptyGiftRequest(): GiftRequest {
  const now = new Date().toISOString();
  return {
    id: createId("gift"),
    created_at: now,
    updated_at: now,
    session_id: "",
    recipient_type: "",
    recipient_custom: "",
    occasion: "",
    occasion_custom: "",
    desired_effect: "",
    desired_effect_custom: "",
    taste_knowledge: "",
    flower_id_link: "",
    taste_note: "",
    taste_style_hint: "",
    taste_palette_hint: "",
    taste_format_hint: "",
    avoid_items: [],
    budget: "",
    recommended_style: "",
    selected_option: "",
    selected_card_text: "",
    postcard_text: "",
    telegram_contact: "",
    telegram_clicked: false,
    source: window.location.search || "direct",
    status: "created",
    last_step: "recipient",
  };
}

function GiftConciergePage({ navigate }: { navigate: (url: string) => void }) {
  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState<GiftStep>("recipient");
  const [request, setRequest] = useState<GiftRequest>(() => createEmptyGiftRequest());
  const [showContactModal, setShowContactModal] = useState(false);
  const [telegramContact, setTelegramContact] = useState(request.telegram_contact || "");
  const [orderAccepted, setOrderAccepted] = useState(false);
  const [bouquetOptions, setBouquetOptions] = useState<GiftBouquetOption[]>(() => loadGiftBouquetOptions(request.id));
  const currentStepIndex = giftSteps.findIndex((item) => item.id === step);
  const recommendation = useMemo(() => buildGiftRecommendation(request), [request]);
  const selectedOption = bouquetOptions.find((item) => item.id === request.selected_option) ?? null;
  const savedFlowerIds = useMemo(() => Object.values(loadSubmissions()).slice(0, 3), []);

  useEffect(() => {
    track("page_view", { page: "gift_concierge", giftRequestId: request.id, step });
  }, [request.id, step]);

  useEffect(() => {
    let alive = true;
    setBouquetOptions(loadGiftBouquetOptions(request.id));
    syncGiftBouquetOptions(request.id).then((options) => {
      if (alive) setBouquetOptions(options);
    });
    return () => {
      alive = false;
    };
  }, [request.id, step]);

  const updateGiftRequest = (patch: Partial<GiftRequest>, nextStep?: GiftStep, eventName?: string) => {
    const updated: GiftRequest = {
      ...request,
      ...patch,
      updated_at: new Date().toISOString(),
      last_step: nextStep ?? step,
    };
    updated.recommended_style = patch.recommended_style ?? buildGiftRecommendation(updated).styleName;
    setRequest(updated);
    saveGiftRequest(updated);
    if (eventName) track(eventName, { giftRequestId: updated.id, ...patch });
    if (nextStep) setStep(nextStep);
  };

  const startGiftFlow = () => {
    const next = createEmptyGiftRequest();
    sessionStorage.setItem(activeGiftRequestKey, next.id);
    setRequest(next);
    setTelegramContact("");
    setOrderAccepted(false);
    setBouquetOptions([]);
    setStep("recipient");
    saveGiftRequest(next);
    track("start_gift_flow_clicked", { source: "gift_intro", giftRequestId: next.id });
    setShowIntro(false);
  };

  const chooseSingle = (field: keyof Pick<GiftRequest, "recipient_type" | "occasion" | "desired_effect" | "taste_knowledge" | "budget">, value: string, nextStep: GiftStep, eventName: string) => {
    updateGiftRequest({ [field]: value } as Partial<GiftRequest>, nextStep, eventName);
  };

  const chooseBouquet = (option: GiftBouquetOption) => {
    updateGiftRequest({
      selected_option: option.id,
      selected_card_text: option.description,
      recommended_style: recommendation.styleName,
    }, "final", "bouquet_option_selected");
  };

  const openGiftTelegram = () => {
    setTelegramContact(request.telegram_contact || "");
    setShowContactModal(true);
  };

  const submitGiftContact = () => {
    const contact = telegramContact.trim();
    if (!contact) return;
    const finalRequest = {
      ...request,
      telegram_contact: contact,
      telegram_clicked: true,
      status: "telegram_clicked" as const,
      updated_at: new Date().toISOString(),
      last_step: "final",
    };
    setRequest(finalRequest);
    saveGiftRequest(finalRequest);
    track("telegram_clicked", { giftRequestId: finalRequest.id, selectedOption: finalRequest.selected_option, budget: finalRequest.budget, contactProvided: true });
    track("flow_completed", { giftRequestId: finalRequest.id });
    setShowContactModal(false);
    setOrderAccepted(true);
  };

  const goBack = () => {
    const index = giftSteps.findIndex((item) => item.id === step);
    if (index <= 0) {
      navigate("/");
      return;
    }
    setStep(giftSteps[index - 1].id);
  };

  if (showIntro) {
    return (
      <main className="app-shell gift-app-shell">
        <section className="quiz-frame gift-frame">
          <Header step={0} onBack={() => navigate("/")} note="3 минуты · 3 варианта" />
          <section className="screen hero-screen gift-intro-screen">
            <div className="gift-intro-copy">
              <p className="eyebrow">Flower ID Gift Concierge</p>
              <h1>Подарите букет, который попадёт в человека</h1>
              <p className="lead">
                Flower ID подберёт цветы под вкус получателя, повод и ваш бюджет. Без догадок. Без случайных букетов. Без риска ошибиться.
              </p>
              <div className="hero-actions landing-actions">
                <button className="primary-button" onClick={() => {
                  startGiftFlow();
                }}>Подобрать букет</button>
                <p className="cta-note">3 минуты · 3 персональных варианта · согласуем детали перед заказом</p>
              </div>
            </div>
            <div className="gift-intro-preview gift-intro-guarantees">
              <article>
                <strong>Свежесть</strong>
                <p>Собираем букет перед доставкой и подбираем стойкие сезонные цветы.</p>
              </article>
              <article>
                <strong>Удобная доставка</strong>
                <p>В Telegram уточним адрес, время и детали, чтобы всё прошло спокойно.</p>
              </article>
              <article>
                <strong>Как на фото</strong>
                <p>Перед отправкой согласуем внешний вид, чтобы ожидания совпали с результатом.</p>
              </article>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell gift-app-shell">
      <section className="quiz-frame gift-frame">
        <Header step={0} onBack={goBack} note="3 минуты · без каталога" />
        <section className="screen gift-screen">
          <div className="gift-progress">
            <span>{currentStepIndex < 5 ? `Шаг ${currentStepIndex + 1} из 5` : giftSteps[currentStepIndex]?.label}</span>
            <i style={{ width: `${Math.min(((currentStepIndex + 1) / giftSteps.length) * 100, 100)}%` }} />
          </div>

          {step === "recipient" && (
            <GiftChoiceStep
              eyebrow="Цветочный консьерж"
              title="Для кого выбираем букет?"
              options={recipientOptions}
              selected={request.recipient_type}
              onSelect={(id) => {
                if (id === "other") {
                  updateGiftRequest({ recipient_type: id }, undefined, "recipient_selected");
                  return;
                }
                chooseSingle("recipient_type", id, "occasion", "recipient_selected");
              }}
            />
          )}
          {step === "recipient" && request.recipient_type === "other" && (
            <GiftManualInput
              label="Кому именно?"
              value={request.recipient_custom || ""}
              placeholder="Например: сестре, бабушке, соседке, тренеру"
              onChange={(value) => updateGiftRequest({ recipient_custom: value }, undefined)}
              onNext={() => updateGiftRequest({ recipient_custom: request.recipient_custom || "" }, "occasion", "recipient_selected")}
              nextDisabled={!request.recipient_custom?.trim()}
            />
          )}

          {step === "occasion" && (
            <>
              <GiftChoiceStep
                title="Что хотите сказать этим букетом?"
                options={getOccasionOptions(request.recipient_type)}
                selected={request.occasion}
                onSelect={(id) => {
                  if (id === "other") {
                    updateGiftRequest({ occasion: id }, undefined, "occasion_selected");
                    return;
                  }
                  chooseSingle("occasion", id, "effect", "occasion_selected");
                }}
              />
              {request.occasion === "other" && (
                <GiftManualInput
                  label="Напишите повод своими словами"
                  value={request.occasion_custom || ""}
                  placeholder="Например: первая встреча после долгой паузы"
                  onChange={(value) => updateGiftRequest({ occasion_custom: value }, undefined)}
                  onNext={() => updateGiftRequest({ occasion_custom: request.occasion_custom || "" }, "effect", "occasion_selected")}
                  nextDisabled={!request.occasion_custom?.trim()}
                />
              )}
            </>
          )}

          {step === "effect" && (
            <>
              <GiftChoiceStep
                title="Какое ощущение должен создать букет?"
                options={getEffectOptions(request)}
                selected={request.desired_effect}
                onSelect={(id) => {
                  if (id === "other") {
                    updateGiftRequest({ desired_effect: id }, undefined, "effect_selected");
                    return;
                  }
                  chooseSingle("desired_effect", id, "taste", "effect_selected");
                }}
              />
              {request.desired_effect === "other" && (
                <GiftManualInput
                  label="Опишите эффект своими словами"
                  value={request.desired_effect_custom || ""}
                  placeholder="Например: спокойно, заботливо, но не романтично"
                  onChange={(value) => updateGiftRequest({ desired_effect_custom: value }, undefined)}
                  onNext={() => updateGiftRequest({ desired_effect_custom: request.desired_effect_custom || "" }, "taste", "effect_selected")}
                  nextDisabled={!request.desired_effect_custom?.trim()}
                />
              )}
            </>
          )}

          {step === "taste" && (
            <>
              <GiftChoiceStep
                title="Что вы знаете о цветочном вкусе получателя?"
                options={tasteOptions}
                selected={request.taste_knowledge}
                onSelect={(id) => {
                  if (id === "request_flower_id") {
                    track("request_flower_id_clicked", { source: "gift_flow", giftRequestId: request.id });
                    navigate("/request");
                    return;
                  }
                  if (id === "has_flower_id") {
                    updateGiftRequest({ taste_knowledge: id }, undefined, "taste_knowledge_selected");
                    return;
                  }
                  if (id === "roughly_know" || id === "unknown") {
                    updateGiftRequest({ taste_knowledge: id }, undefined, "taste_knowledge_selected");
                    return;
                  }
                  chooseSingle("taste_knowledge", id, "budget", "taste_knowledge_selected");
                }}
              />
              {request.taste_knowledge === "has_flower_id" && (
                <GiftFlowerIdPicker
                  value={request.flower_id_link || ""}
                  saved={savedFlowerIds}
                  onChange={(value) => updateGiftRequest({ flower_id_link: value }, undefined)}
                  onNext={() => updateGiftRequest({ flower_id_link: request.flower_id_link || "" }, "budget", "taste_knowledge_selected")}
                />
              )}
              {request.taste_knowledge === "roughly_know" && (
                <GiftManualInput
                  label="Что известно о вкусе?"
                  value={request.taste_note || ""}
                  placeholder="Например: любит нежные оттенки, не любит красные розы, лучше без сильного запаха"
                  onChange={(value) => updateGiftRequest({ taste_note: value }, undefined)}
                  onNext={() => updateGiftRequest({ taste_note: request.taste_note || "" }, "budget", "taste_knowledge_selected")}
                  nextDisabled={!request.taste_note?.trim()}
                />
              )}
              {request.taste_knowledge === "unknown" && (
                <GiftTasteGuess
                  request={request}
                  onChange={updateGiftRequest}
                  onNext={() => updateGiftRequest({}, "budget", "taste_knowledge_selected")}
                />
              )}
            </>
          )}

          {step === "budget" && (
            <GiftChoiceStep
              title="Какой бюджет комфортен?"
              options={budgetOptions}
              selected={request.budget}
              onSelect={(id) => chooseSingle("budget", id, "result", "budget_selected")}
            />
          )}

          {step === "result" && (
            <GiftRecommendationScreen
              request={request}
              recommendation={recommendation}
              options={bouquetOptions}
              onSelect={chooseBouquet}
            />
          )}

          {step === "final" && (
            <GiftFinalScreen
              request={request}
              recommendation={recommendation}
              selectedOption={selectedOption}
              onTelegram={openGiftTelegram}
              orderAccepted={orderAccepted}
            />
          )}

          {step !== "recipient" && step !== "final" && (
            <button className="text-button gift-back-inline" onClick={goBack}>Назад</button>
          )}
          {step === "final" && <button className="text-button gift-back-inline" onClick={() => setStep("result")}>Назад к вариантам</button>}
        </section>
      </section>
      {showContactModal && (
        <GiftContactModal
          value={telegramContact}
          onChange={setTelegramContact}
          onClose={() => setShowContactModal(false)}
          onSubmit={submitGiftContact}
        />
      )}
    </main>
  );
}

function GiftChoiceStep({ eyebrow, title, options, selected, onSelect }: { eyebrow?: string; title: string; options: GiftOption[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="gift-step-heading">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      <div className="gift-choice-grid">
        {options.map((option) => (
          <button className={`gift-choice-card ${selected === option.id ? "selected" : ""}`} key={option.id} onClick={() => onSelect(option.id)}>
            {option.label}
            {option.description && <small>{option.description}</small>}
          </button>
        ))}
      </div>
    </>
  );
}

function GiftManualInput({
  label,
  value,
  placeholder,
  onChange,
  onNext,
  nextDisabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="gift-extra-panel">
      <label>
        {label}
        <textarea className="text-area" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </label>
      <button className="primary-button" disabled={nextDisabled} onClick={onNext}>Дальше</button>
    </div>
  );
}

function GiftFlowerIdPicker({
  value,
  saved,
  onChange,
  onNext,
}: {
  value: string;
  saved: FlowerSubmission[];
  onChange: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="gift-extra-panel">
      <label>
        Ссылка на Flower ID
        <input value={value} placeholder="Вставьте ссылку на Flower ID" onChange={(event) => onChange(event.target.value)} />
      </label>
      {saved.length > 0 && (
        <div className="gift-saved-picker">
          <span>Или выбрать из сохранённых</span>
          {saved.map((submission) => (
            <button className="secondary-button" key={submission.id} onClick={() => onChange(`${window.location.origin}/result/${submission.id}`)}>
              {submission.answers.user.name || formatFlowerId(submission.id)}
            </button>
          ))}
        </div>
      )}
      <button className="primary-button" disabled={!value.trim()} onClick={onNext}>Дальше</button>
    </div>
  );
}

function GiftTasteGuess({
  request,
  onChange,
  onNext,
}: {
  request: GiftRequest;
  onChange: (patch: Partial<GiftRequest>, nextStep?: GiftStep, eventName?: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="gift-extra-panel">
      <label>
        Получатель скорее любит
        <input
          value={request.taste_style_hint || ""}
          placeholder="Например: классику, минимализм, что-то необычное"
          onChange={(event) => onChange({ taste_style_hint: event.target.value }, undefined)}
        />
      </label>
      <label>
        Цвета лучше выбрать
        <input
          value={request.taste_palette_hint || ""}
          placeholder="Например: нежные, светлые, яркие, спокойные"
          onChange={(event) => onChange({ taste_palette_hint: event.target.value }, undefined)}
        />
      </label>
      <label>
        Букет должен быть
        <input
          value={request.taste_format_hint || ""}
          placeholder="Например: компактный, средний, заметный, без лишней упаковки"
          onChange={(event) => onChange({ taste_format_hint: event.target.value }, undefined)}
        />
      </label>
      <button className="primary-button" onClick={onNext}>Дальше</button>
    </div>
  );
}

function GiftBottomNav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="gift-bottom-nav">
      <button className="secondary-button" onClick={onBack}>Назад</button>
      <button className="primary-button" disabled={nextDisabled} onClick={onNext}>Дальше</button>
    </div>
  );
}

function GiftRecommendationScreen({ request, recommendation, options, onSelect }: { request: GiftRequest; recommendation: GiftRecommendation; options: GiftBouquetOption[]; onSelect: (option: GiftBouquetOption) => void }) {
  useEffect(() => {
    track("recommendation_viewed", { giftRequestId: request.id, recommendedStyle: recommendation.styleName, budget: request.budget, realOptions: options.length });
  }, [recommendation.styleName, options.length, request.budget, request.id]);

  return (
    <section className="gift-result">
      <p className="eyebrow">Персональная рекомендация</p>
      <h1>3 варианта букета</h1>
      <div className="gift-summary-row">
        <span>Кому: {giftRecipientLabel(request)}</span>
        <span>Повод: {giftOccasionLabel(request)}</span>
        <span>Эффект: {giftEffectLabel(request)}</span>
        <span>Бюджет: {giftLabel(budgetOptions, request.budget)}</span>
      </div>
      {options.length === 0 ? (
        <article className="gift-pending-card">
          <span>Заявка {request.id}</span>
          <h2>Мы подбираем 3 идеальных варианта</h2>
          <p>
            Флорист посмотрит ответы, бюджет и повод. Скоро здесь появятся реальные букеты с фото, описанием, ценой и возможностью заказать.
          </p>
        </article>
      ) : (
        <div className="gift-bouquet-options">
          {options.map((option) => (
            <article className="gift-bouquet-card" key={option.id}>
              <div className="gift-bouquet-image" style={{ backgroundImage: `url(${option.image})` }} />
              <span>{option.price}</span>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              <button className="primary-button" onClick={() => onSelect(option)}>{option.cta || "Заказать этот букет"}</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function GiftFinalScreen({
  request,
  recommendation,
  selectedOption,
  onTelegram,
  orderAccepted,
}: {
  request: GiftRequest;
  recommendation: GiftRecommendation;
  selectedOption: GiftBouquetOption | null;
  onTelegram: () => void;
  orderAccepted: boolean;
}) {
  const image = selectedOption?.image || recommendation.image;
  return (
    <section className="gift-final">
      <p className="eyebrow">Заказ готов</p>
      <h1>Всё готово</h1>
      <article className="gift-final-card">
        <div className="gift-final-image" style={{ backgroundImage: `url(${image})` }} aria-hidden="true" />
        <h2>{selectedOption?.title || "Персональный вариант Flower ID"}</h2>
        <p>{selectedOption?.price || giftLabel(budgetOptions, request.budget)}</p>
        <dl>
          <div><dt>Кому</dt><dd>{giftRecipientLabel(request)}</dd></div>
          <div><dt>Повод</dt><dd>{giftOccasionLabel(request)}</dd></div>
          <div><dt>Эффект</dt><dd>{giftEffectLabel(request)}</dd></div>
          <div><dt>Стиль</dt><dd>{recommendation.styleName}</dd></div>
        </dl>
      </article>
      <p className="lead">Дальше мы уточним адрес и время доставки в Telegram. Перед отправкой вы получите фото готового букета на согласование.</p>
      {orderAccepted && (
        <div className="gift-accepted-note">
          <strong>Заказ принят</strong>
          <span>Мы свяжемся с вами в Telegram, уточним детали и подготовим 3 подходящих варианта.</span>
        </div>
      )}
      <button className="primary-button" onClick={onTelegram}>{orderAccepted ? "Изменить контакт" : "Оставить контакт в Telegram"}</button>
    </section>
  );
}

function GiftContactModal({ value, onChange, onClose, onSubmit }: { value: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="gift-contact-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="gift-contact-modal" role="dialog" aria-modal="true" aria-labelledby="gift-contact-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="gift-contact-close" type="button" onClick={onClose}>Закрыть</button>
        <p className="eyebrow">Контакт для заказа</p>
        <h2 id="gift-contact-title">Куда написать в Telegram?</h2>
        <p>Оставьте @username или номер телефона. Мы напишем вам, уточним детали доставки и подготовим варианты букета.</p>
        <label>
          Telegram или телефон
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="@username или +7..."
            autoFocus
          />
        </label>
        <button className="primary-button" type="button" onClick={onSubmit} disabled={!value.trim()}>Отправить заявку</button>
      </section>
    </div>
  );
}

function GiftAdminPage({ navigate }: { navigate: (url: string) => void }) {
  const params = new URLSearchParams(window.location.search);
  const [requests, setRequests] = useState<Record<string, GiftRequest>>(() => loadGiftRequests());
  const [filter, setFilter] = useState<"all" | "pending" | "ready" | "selected">("pending");
  const [syncNote, setSyncNote] = useState("");
  const [queueSize, setQueueSize] = useState(() => getCollectorQueueSize());
  const allGiftRequests = sortGiftRequests(Object.values(requests).filter(isMeaningfulGiftRequest));
  const giftRequestList = allGiftRequests.filter((request) => {
    const proposalCount = loadGiftBouquetOptions(request.id).length;
    if (filter === "pending") return !proposalCount && !request.selected_option;
    if (filter === "ready") return proposalCount > 0 && !request.selected_option;
    if (filter === "selected") return Boolean(request.selected_option);
    return true;
  });
  const initialRequestId = params.get("requestId") || giftRequestList[0]?.id || "";
  const [requestId, setRequestId] = useState(initialRequestId);
  const [saved, setSaved] = useState(false);
  const [options, setOptions] = useState<GiftBouquetOption[]>(() => createAdminBouquetDrafts(initialRequestId));
  const selectedRequest = requestId ? requests[requestId] : null;
  const selectedOption = selectedRequest?.selected_option
    ? options.find((option) => option.id === selectedRequest.selected_option)
    : null;

  const refreshGiftRequests = () => {
    flushCollectorQueue();
    setQueueSize(getCollectorQueueSize());
    let alive = true;
    setSyncNote(isCollectorConfigured() ? "Обновляем заявки..." : "Google Sheets collector не подключён в этой сборке.");
    syncGiftRequests().then((synced) => {
      if (!alive) return;
      const list = sortGiftRequests(Object.values(synced));
      setRequests(synced);
      if (!requestId && list[0]?.id) setRequestId(list[0].id);
      setQueueSize(getCollectorQueueSize());
      setSyncNote(isCollectorConfigured() ? "Заявки обновлены." : "Показаны только локальные заявки этого браузера.");
    });
    return () => {
      alive = false;
    };
  };

  useEffect(() => {
    return refreshGiftRequests();
  }, []);

  useEffect(() => {
    setOptions(createAdminBouquetDrafts(requestId));
    setSaved(false);
  }, [requestId]);

  const updateOption = (index: number, patch: Partial<GiftBouquetOption>) => {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option));
    setSaved(false);
  };

  const attachPhoto = async (index: number, file: File | null) => {
    if (!file) return;
    const image = await fileToCompressedDataUrl(file);
    updateOption(index, { image });
  };

  const saveOptions = () => {
    const now = new Date().toISOString();
    const readyOptions = options
      .map((option, index) => ({
        ...option,
        id: option.id || `proposal_${index + 1}`,
        gift_request_id: requestId,
        cta: option.cta || "Заказать этот букет",
        created_at: option.created_at || now,
        updated_at: now,
      }))
      .filter((option) => option.title.trim() && option.price.trim() && option.description.trim() && option.image.trim());
    saveGiftBouquetOptions(requestId, readyOptions);
    track("gift_bouquets_saved", { giftRequestId: requestId, count: readyOptions.length });
    setOptions(readyOptions.length ? readyOptions : createAdminBouquetDrafts(requestId));
    setSaved(true);
  };

  return (
    <main className="app-shell gift-app-shell">
      <section className="quiz-frame gift-frame">
        <Header step={0} onBack={() => navigate("/gift")} note="служебный экран" />
        <section className="screen gift-admin-screen">
          <p className="eyebrow">Flower ID Admin</p>
          <h1>Заявки на подбор</h1>
          <p className="lead">Откройте необработанную заявку, загрузите реальные фото, цену и описание. Когда клиент выберет букет, выбор появится здесь.</p>
          <div className="gift-admin-diagnostics">
            <span>Локально: {allGiftRequests.length}</span>
            <span>В фильтре: {giftRequestList.length}</span>
            <span>Очередь: {queueSize}</span>
            <span>{isCollectorConfigured() ? `Sheets: ${getCollectorUrlHint()}` : "Sheets: не подключён"}</span>
          </div>
          <button className="secondary-button" onClick={() => { refreshGiftRequests(); }}>Обновить заявки</button>
          {syncNote && <p className="gift-admin-sync-note">{syncNote}</p>}
          <div className="gift-admin-filters" role="tablist" aria-label="Фильтр заявок">
            <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Ждут варианты</button>
            <button className={filter === "ready" ? "active" : ""} onClick={() => setFilter("ready")}>Варианты готовы</button>
            <button className={filter === "selected" ? "active" : ""} onClick={() => setFilter("selected")}>Клиент выбрал</button>
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button>
          </div>
          <div className="gift-admin-layout">
            <aside className="gift-admin-list">
              {giftRequestList.length === 0 && <p className="gift-admin-empty">В этом статусе пока нет заявок.</p>}
              {giftRequestList.map((request) => {
                const proposalCount = loadGiftBouquetOptions(request.id).length;
                const statusLabel = request.selected_option ? "Клиент выбрал" : proposalCount ? "Варианты добавлены" : "Ждёт варианты";
                return (
                  <button
                    className={`gift-admin-request ${request.id === requestId ? "selected" : ""}`}
                    key={request.id}
                    onClick={() => setRequestId(request.id)}
                  >
                    <strong>{giftRecipientLabel(request)}</strong>
                    <span>{giftOccasionLabel(request)} · {giftLabel(budgetOptions, request.budget) || "бюджет не выбран"}</span>
                    <em>{statusLabel}</em>
                  </button>
                );
              })}
            </aside>

            <div className="gift-admin-editor">
              <label className="gift-admin-field">
                Номер заявки
                <input value={requestId} onChange={(event) => setRequestId(event.target.value)} placeholder="gift_..." />
              </label>
              {selectedRequest && (
                <article className="gift-admin-brief">
                  <strong>Бриф</strong>
                  <span>Кому: {giftRecipientLabel(selectedRequest)}</span>
                  <span>Повод: {giftOccasionLabel(selectedRequest)}</span>
                  <span>Эффект: {giftEffectLabel(selectedRequest)}</span>
                  <span>Бюджет: {giftLabel(budgetOptions, selectedRequest.budget) || "не выбран"}</span>
                  {selectedRequest.telegram_contact && <span>Контакт: {selectedRequest.telegram_contact}</span>}
                  {selectedRequest.taste_note && <span>Вкус: {selectedRequest.taste_note}</span>}
                </article>
              )}
              {selectedOption && (
                <article className="gift-admin-choice">
                  <strong>Итоговый выбор клиента</strong>
                  <span>{selectedOption.title} · {selectedOption.price}</span>
                </article>
              )}
              <div className="gift-admin-options">
                {options.map((option, index) => (
                  <article className="gift-admin-card" key={option.id || index}>
                    <strong>Вариант {index + 1}</strong>
                    {option.image && <div className="gift-admin-photo-preview" style={{ backgroundImage: `url(${option.image})` }} />}
                    <label>
                      Фото букета
                      <input type="file" accept="image/*" onChange={(event) => attachPhoto(index, event.target.files?.[0] || null)} />
                    </label>
                    <label>
                      Название
                      <input value={option.title} onChange={(event) => updateOption(index, { title: event.target.value })} placeholder="Например: Точно понравится" />
                    </label>
                    <label>
                      Цена
                      <input value={option.price} onChange={(event) => updateOption(index, { price: event.target.value })} placeholder="Например: 7 500 ₽" />
                    </label>
                    <label>
                      Описание
                      <textarea value={option.description} onChange={(event) => updateOption(index, { description: event.target.value })} placeholder="Что входит в букет и почему он подходит" />
                    </label>
                  </article>
                ))}
              </div>
              {saved && <p className="gift-admin-saved">Сохранено. На клиентском экране появятся реальные варианты.</p>}
              <button className="primary-button" disabled={!requestId.trim()} onClick={saveOptions}>Сохранить варианты</button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function sortGiftRequests(requests: GiftRequest[]) {
  return [...requests].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
}

function isMeaningfulGiftRequest(request: GiftRequest) {
  return Boolean(
    request.recipient_type ||
    request.occasion ||
    request.desired_effect ||
    request.taste_knowledge ||
    request.budget ||
    request.telegram_contact ||
    request.selected_option,
  );
}

function fileToCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Не удалось подготовить изображение"));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function createAdminBouquetDrafts(requestId: string): GiftBouquetOption[] {
  const existing = requestId ? loadGiftBouquetOptions(requestId) : [];
  if (existing.length) return existing;
  const now = new Date().toISOString();
  return [0, 1, 2].map((index) => ({
    id: `proposal_${index + 1}`,
    gift_request_id: requestId,
    title: "",
    price: "",
    description: "",
    image: "",
    cta: "Заказать этот букет",
    created_at: now,
    updated_at: now,
  }));
}

function buildGiftRecommendation(request: GiftRequest): GiftRecommendation {
  const styleId = chooseGiftStyle(request);
  const guide = giftStyleGuide[styleId];
  return {
    styleId,
    ...guide,
    options: buildGiftBouquetOptions(request, styleId, guide),
  };
}

function chooseGiftStyle(request: GiftRequest): GiftStyleId {
  const businessRecipient = ["client", "colleague", "teacher_doctor"].includes(request.recipient_type);
  const businessOccasion = ["business", "thanks"].includes(request.occasion);
  const unknownHints = `${request.taste_style_hint || ""} ${request.taste_palette_hint || ""} ${request.taste_format_hint || ""}`.toLowerCase();
  if (unknownHints.includes("ярк")) return "bright_joy";
  if (unknownHints.includes("класс")) return "warm_classic";
  if (unknownHints.includes("миним") || unknownHints.includes("спокой")) return "quiet_luxury";
  if (businessRecipient && businessOccasion && ["quiet_expensive", "status", "smart"].includes(request.desired_effect)) {
    return request.recipient_type === "client" ? "quiet_luxury" : "business_elegance";
  }
  if (request.recipient_type === "mother" || request.desired_effect === "family_warm") return "warm_classic";
  if (request.desired_effect === "wow" || request.occasion === "impress") return "wow_drama";
  if (request.occasion === "birthday" && ["wow", "smile"].includes(request.desired_effect)) return "bright_joy";
  if (request.desired_effect === "smile") return "bright_joy";
  if (["quiet_expensive", "status", "smart"].includes(request.desired_effect)) return "quiet_luxury";
  if (["partner", "friend"].includes(request.recipient_type) && ["touching", "romantic"].includes(request.desired_effect)) return "garden_romance";
  return "garden_romance";
}

function buildGiftBouquetOptions(request: GiftRequest, styleId: GiftStyleId, guide: Omit<GiftRecommendation, "styleId" | "options">): GiftBouquetOption[] {
  const budget = giftLabel(budgetOptions, request.budget) || "5 000–8 000 ₽";
  const now = new Date().toISOString();
  const safeAvoid = request.avoid_items.includes("unknown") || !request.avoid_items.length
    ? "без спорного декора и резких решений"
    : `без ${request.avoid_items.map((id) => giftLabel(avoidGiftOptions, id).toLowerCase()).join(", ")}`;
  const image = guide.image;
  const baseFlowers = guide.flowers.slice(0, 4).join(", ");
  const wowFlowers = styleId === "wow_drama" ? "амариллисами, антуриумом, орхидеями и крупной зеленью" : "пионовидными розами, ранункулюсами, фактурной зеленью и премиальной упаковкой";

  return [
    {
      id: "safe_match",
      gift_request_id: request.id,
      title: "Точно понравится",
      price: budget,
      description: `Персональный букет в стиле «${guide.styleName.toLowerCase()}»: ${baseFlowers}. ${capitalize(safeAvoid)}.`,
      cta: "Выбрать этот",
      image,
      created_at: now,
      updated_at: now,
    },
    {
      id: "wow_effect",
      gift_request_id: request.id,
      title: "Вау, но деликатно",
      price: getGiftPriceVariant(request.budget, "higher"),
      description: `Более объёмная версия в том же стиле с ${wowFlowers}. Подойдёт, если хочется произвести впечатление.`,
      cta: "Хочу вау-версию",
      image: styleId === "bright_joy" ? "/archetypes/evening-wow.jpg" : image,
      created_at: now,
      updated_at: now,
    },
    {
      id: "gentle_gesture",
      gift_request_id: request.id,
      title: "Просто порадовать",
      price: getGiftPriceVariant(request.budget, "lower"),
      description: "Камерный букет в мягкой гамме. Хорошо подходит для подарка без повода, лёгкого знака внимания или тёплого жеста.",
      cta: "Заказать как жест внимания",
      image: styleId === "quiet_luxury" ? "/archetypes/white-green-minimalism.jpg" : "/archetypes/paris-morning.jpg",
      created_at: now,
      updated_at: now,
    },
  ];
}

function buildGiftTelegramMessage(request: GiftRequest, selectedOption: GiftBouquetOption | null, recommendation: GiftRecommendation) {
  return [
    "Здравствуйте! Хочу заказать букет через Flower ID.",
    "",
    `Кому: ${giftRecipientLabel(request)}`,
    `Повод: ${giftOccasionLabel(request)}`,
    `Эффект: ${giftEffectLabel(request)}`,
    `Бюджет: ${giftLabel(budgetOptions, request.budget)}`,
    `Рекомендованный стиль: ${recommendation.styleName}`,
    `Выбранный вариант: ${selectedOption?.title || request.selected_card_text || "подберите лучший вариант"}`,
    request.flower_id_link ? `Flower ID: ${request.flower_id_link}` : "",
    request.taste_note ? `Что известно о вкусе: ${request.taste_note}` : "",
    request.taste_style_hint || request.taste_palette_hint || request.taste_format_hint
      ? `Уточнения по вкусу: ${[request.taste_style_hint, request.taste_palette_hint, request.taste_format_hint].filter(Boolean).join("; ")}`
      : "",
  ].filter(Boolean).join("\n");
}

function giftLabel(options: GiftOption[], id: string) {
  return options.find((option) => option.id === id)?.label || id || "не указано";
}

function giftRecipientLabel(request: GiftRequest) {
  if (request.recipient_type === "other") return request.recipient_custom || "другому человеку";
  return giftLabel(recipientOptions, request.recipient_type);
}

function giftOccasionLabel(request: GiftRequest) {
  if (request.occasion === "other") return request.occasion_custom || "другой повод";
  return giftLabel(getOccasionOptions(request.recipient_type), request.occasion);
}

function giftEffectLabel(request: GiftRequest) {
  if (request.desired_effect === "other") return request.desired_effect_custom || "особое ощущение";
  return giftLabel(getEffectOptions(request), request.desired_effect);
}

function getOccasionOptions(recipientType: string): GiftOption[] {
  const common = [
    { id: "just_because", label: "Просто порадовать" },
    { id: "birthday", label: "Поздравить с днём рождения" },
    { id: "thanks", label: "Поблагодарить" },
    { id: "support", label: "Поддержать" },
    { id: "milestone", label: "Поздравить с важным событием" },
  ];
  const byRecipient: Record<string, GiftOption[]> = {
    partner: [
      { id: "just_because", label: "Просто порадовать" },
      { id: "birthday", label: "Поздравить с днём рождения" },
      { id: "romantic", label: "Сделать романтичный жест" },
      { id: "apology", label: "Извиниться" },
      { id: "impress", label: "Произвести впечатление" },
      { id: "milestone", label: "Поздравить с важным событием" },
    ],
    mother: [
      { id: "just_because", label: "Просто порадовать" },
      { id: "birthday", label: "Поздравить с днём рождения" },
      { id: "thanks", label: "Поблагодарить" },
      { id: "support", label: "Поддержать" },
      { id: "milestone", label: "Поздравить с важным событием" },
    ],
    colleague: [
      { id: "birthday", label: "Поздравить с днём рождения" },
      { id: "thanks", label: "Поблагодарить" },
      { id: "milestone", label: "Поздравить с важным событием" },
      { id: "business", label: "Деловой подарок" },
    ],
    client: [
      { id: "thanks", label: "Поблагодарить" },
      { id: "milestone", label: "Поздравить с важным событием" },
      { id: "business", label: "Деловой подарок" },
      { id: "impress", label: "Произвести впечатление" },
    ],
    teacher_doctor: [
      { id: "thanks", label: "Поблагодарить" },
      { id: "birthday", label: "Поздравить с днём рождения" },
      { id: "milestone", label: "Поздравить с важным событием" },
    ],
  };
  return [...(byRecipient[recipientType] || common), { id: "other", label: "Другое" }];
}

function getEffectOptions(request: GiftRequest): GiftOption[] {
  const business = ["client", "colleague", "teacher_doctor"].includes(request.recipient_type) || request.occasion === "business";
  const family = request.recipient_type === "mother";
  const romantic = request.recipient_type === "partner" || request.occasion === "romantic";
  const base = business
    ? [
      { id: "quiet_expensive", label: "Дорого и сдержанно" },
      { id: "status", label: "Статусно, но без пафоса" },
      { id: "smart", label: "Умно и небанально" },
      { id: "smile", label: "Просто вызвать улыбку" },
    ]
    : family
      ? [
        { id: "family_warm", label: "Тепло и по-семейному" },
        { id: "touching", label: "Нежно и трогательно" },
        { id: "smile", label: "Просто вызвать улыбку" },
        { id: "quiet_expensive", label: "Дорого и сдержанно" },
      ]
      : romantic
        ? [
          { id: "touching", label: "Нежно и трогательно" },
          { id: "romantic", label: "Романтично" },
          { id: "wow", label: "Вау и эффектно" },
          { id: "quiet_expensive", label: "Дорого и сдержанно" },
        ]
        : [
          { id: "touching", label: "Нежно и трогательно" },
          { id: "smile", label: "Просто вызвать улыбку" },
          { id: "wow", label: "Вау и эффектно" },
          { id: "smart", label: "Умно и небанально" },
        ];
  return [...base, { id: "other", label: "Другое" }];
}

function getGiftPriceVariant(budget: string, mode: "higher" | "lower") {
  const map: Record<string, { higher: string; lower: string }> = {
    under_5000: { higher: "5 000–7 000 ₽", lower: "до 5 000 ₽" },
    "5000_8000": { higher: "8 000–12 000 ₽", lower: "5 000–6 000 ₽" },
    "8000_15000": { higher: "15 000–22 000 ₽", lower: "8 000–10 000 ₽" },
    "15000_plus": { higher: "20 000+ ₽", lower: "15 000–18 000 ₽" },
    unknown: { higher: "8 000–12 000 ₽", lower: "5 000–7 000 ₽" },
  };
  return map[budget]?.[mode] || map.unknown[mode];
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
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
        text="Возможно, ссылка устарела или была скопирована не полностью."
        action="Создать новый Flower ID"
        onAction={() => navigate("/")}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
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
  const requests = Object.values(loadFlowerRequests()).sort((a, b) =>
    (b.completed_at || b.started_at || b.opened_at || b.created_at).localeCompare(a.completed_at || a.started_at || a.opened_at || a.created_at),
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
          <p className="lead">Здесь хранятся твои профили и запросы близким. Можно следить за статусом, открыть готовую карточку и заказать букет.</p>
          {!!requests.length && (
            <section className="saved-section">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Запросы близким</p>
                  <h2>Статус прохождения</h2>
                </div>
                <button className="secondary-button compact-button" onClick={() => navigate("/request")}>Новый запрос</button>
              </div>
              <div className="saved-id-list">
                {requests.map((request) => (
                  <RequestSummaryCard key={request.id} request={request} navigate={navigate} />
                ))}
              </div>
            </section>
          )}
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

  if (created) {
    return <RequestStatusPage requestId={created.id} navigate={navigate} initialMessage={readyMessage} initialLink={requestLink} />;
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate("/")} />
        <section className="screen">
          <h1>Узнай Flower ID человека, которому хочешь подарить цветы</h1>
          <p className="lead">Отправь красивую ссылку: получатель создаст цветочный стиль, а ты сможешь заказать букет без риска ошибиться.</p>
          <div className="contact-panel">
            <label>Имя получателя<input value={form.recipientName} placeholder="Анна" onChange={(event) => setForm({ ...form, recipientName: event.target.value })} /></label>
            <label>От кого запрос<input value={form.requesterName} placeholder="Сергей" onChange={(event) => setForm({ ...form, requesterName: event.target.value })} /></label>
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
            navigate(`/request-status/${request.id}`);
          }}>Создать ссылку-запрос</button>
        </section>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function RequestStatusPage({
  requestId,
  navigate,
  initialMessage,
  initialLink,
}: {
  requestId: string;
  navigate: (url: string) => void;
  initialMessage?: string;
  initialLink?: string;
}) {
  const [tick, setTick] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const request = useMemo(() => loadFlowerRequest(requestId), [requestId, tick]);
  const submission = useMemo(() => (request?.submissionId ? loadSubmission(request.submissionId) : null), [request?.submissionId, tick]);
  const requestLink = request ? initialLink || `${window.location.origin}/r/${encodeURIComponent(encodeRequestToken(request))}` : "";
  const readyMessage = request
    ? initialMessage || `${request.requesterName || "Привет"} хочет подарить цветы без ошибки.\nСоздай свой Flower ID - это займет около минуты и покажет твой цветочный стиль.\n${requestLink}`
    : "";

  useEffect(() => {
    track("request_status_viewed", { requestId, status: request?.status });
    const timer = window.setInterval(() => setTick((value) => value + 1), 2500);
    return () => window.clearInterval(timer);
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    if (!isCollectorConfigured()) {
      setSyncMessage("Автообновление между устройствами не подключено. Нужен VITE_FLOWER_COLLECTOR_URL.");
      return () => {
        cancelled = true;
      };
    }
    syncFlowerRequestStatus(requestId)
      .then((syncedRequest) => {
        if (cancelled) return;
        if (syncedRequest) {
          setSyncMessage("Статус обновлён");
          if (syncedRequest.status !== request?.status || syncedRequest.submissionId !== request?.submissionId) {
            setTick((value) => value + 1);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSyncMessage("Не удалось обновить статус. Попробуй ещё раз чуть позже.");
      });
    return () => {
      cancelled = true;
    };
  }, [request?.status, request?.submissionId, requestId, tick]);

  if (!request) {
    return (
      <EmptyState
        title="Запрос не найден"
        text="Возможно, он был создан на другом устройстве или ссылка скопирована не полностью."
        action="Создать новый запрос"
        onAction={() => navigate("/request")}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate("/my-flower-id")} />
        <section className="screen request-status-screen">
          <p className="eyebrow">Запрос Flower ID</p>
          <h1>{request.recipientName ? `Flower ID для ${request.recipientName}` : "Статус запроса"}</h1>
          <p className="lead">
            Следи за прохождением. Когда профиль будет готов, здесь появится карточка и возможность заказать букет по Flower ID.
          </p>

          <RequestProgress request={request} />
          {syncMessage && <p className="subtle request-sync-note">{syncMessage}</p>}

          {submission ? (
            <>
              <article className="request-ready-card">
                <div>
                  <span>{formatFlowerId(submission.id)}</span>
                  <h2>{submission.answers.user.name || request.recipientName} — {submission.computed_profile.title}</h2>
                  <p>{submission.computed_profile.description}</p>
                </div>
                <div className="saved-id-actions">
                  <button className="primary-button" onClick={() => document.getElementById("request-order-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    Заказать цветы по Flower ID
                  </button>
                  <button className="secondary-button" onClick={() => navigate(`/result/${submission.id}?requestId=${encodeURIComponent(request.id)}`)}>Посмотреть Flower ID</button>
                </div>
              </article>
              <RequestOrderPanel request={request} submission={submission} navigate={navigate} />
            </>
          ) : (
            <article className="message-card request-wait-card">
              <strong>{requestStatusCopy(request.status).title}</strong>
              <p>{requestStatusCopy(request.status).text}</p>
              {request.status === "created" && (
                <div className="action-stack">
                  <button className="primary-button" onClick={() => openShare(readyMessage, requestLink, "request_share_clicked")}>Отправить запрос</button>
                </div>
              )}
            </article>
          )}
        </section>
      </section>
    </main>
  );
}

function RequestSummaryCard({ request, navigate }: { request: FlowerRequest; navigate: (url: string) => void }) {
  const submission = request.submissionId ? loadSubmission(request.submissionId) : null;
  const status = requestStatusCopy(request.status);
  return (
    <article className="saved-id-card request-summary-card">
      <span>{status.label}</span>
      <h2>{request.recipientName || "Получатель"}</h2>
      <p>{request.occasion || "Повод не указан"} · {formatDate(request.completed_at || request.started_at || request.opened_at || request.created_at)}</p>
      <div className="saved-id-actions">
        <button className="secondary-button" onClick={() => navigate(`/request-status/${request.id}`)}>
          {submission ? "Открыть и заказать" : "Смотреть статус"}
        </button>
      </div>
    </article>
  );
}

function RequestProgress({ request }: { request: FlowerRequest }) {
  const steps = [
    { id: "created", label: "Запрос создан" },
    { id: "opened", label: "Ссылка открыта" },
    { id: "started_quiz", label: "Квиз начат" },
    { id: "completed", label: "Flower ID готов" },
  ];
  const currentIndex = steps.findIndex((step) => step.id === request.status);
  return (
    <div className="request-progress" aria-label="Статус прохождения Flower ID">
      {steps.map((step, index) => (
        <div className={index <= currentIndex ? "active" : ""} key={step.id}>
          <i aria-hidden="true" />
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function RequestOrderPanel({ request, submission, navigate }: { request: FlowerRequest; submission: FlowerSubmission; navigate: (url: string) => void }) {
  const [draft, setDraft] = useState<OrderDraft>({
    budget: "",
    occasion: request.occasion,
    deliveryDate: "",
    deliveryDetails: "",
    senderName: request.requesterName,
    senderContact: "",
    comment: "",
  });
  const publicLink = createPublicLink(submission.answers, submission.computed_profile, submission.id);
  const message = buildOrderMessage(submission.answers, submission.computed_profile, publicLink, request.id, draft);
  const canOrder = canSubmitOrder(draft);
  const submitOrder = () => {
    const order = createFlowerOrder({
      draft,
      message,
      source: "request_status",
      submissionId: submission.id,
      requestId: request.id,
      flowerId: formatFlowerId(submission.id),
      recipientName: submission.answers.user.name || request.recipientName || "не указано",
      archetype: submission.computed_profile.primary_archetype,
    });
    saveFlowerOrder(order);
    navigate(`/order-next/${order.id}`);
  };

  return (
    <section className="order-panel" id="request-order-panel">
      <p className="eyebrow">Заказ букета</p>
      <h2>Заказать по этому Flower ID</h2>
      <p>Укажи бюджет и повод — флористу сразу уйдёт понятный бриф по стилю, стоп-листу и задаче.</p>
      <OrderFields draft={draft} onChange={setDraft} />
      <OrderBriefPreview title="Что получит флорист" message={message} />
      <button
        className="primary-button"
        disabled={!canOrder}
        onClick={submitOrder}
      >
        Заказать букет
      </button>
      {!canOrder && <p className="subtle">Чтобы оформить заказ, заполни бюджет, повод и контакт для связи.</p>}
    </section>
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
        </section>
      </section>
    </main>
  );
}

function OrderNextStepsPage({ orderId, navigate }: { orderId: string; navigate: (url: string) => void }) {
  const order = loadFlowerOrders()[orderId] ?? null;
  const [copied, setCopied] = useState(false);

  if (!order) {
    return (
      <EmptyState
        title="Заказ не найден"
        text="Возможно, он был создан на другом устройстве. Можно вернуться к Flower ID и оформить заказ ещё раз."
        action="К моим Flower ID"
        onAction={() => navigate("/my-flower-id")}
      />
    );
  }

  const openTelegram = async () => {
    await openOrder(order.message, {
      orderId: order.id,
      submissionId: order.submissionId,
      requestId: order.requestId,
      archetypeId: String(order.archetype),
    });
    setCopied(true);
  };

  return (
    <main className="app-shell">
      <section className="quiz-frame">
        <Header step={0} onBack={() => navigate(order.submissionId && order.submissionId !== "public_profile" ? `/result/${order.submissionId}` : "/")} />
        <section className="screen order-next-screen">
          <p className="eyebrow">Заказ подготовлен</p>
          <h1>Остался один шаг в Telegram</h1>
          <p className="lead">
            Мы подготовили сообщение для флориста и скопируем его в буфер. Открой Telegram, вставь сообщение в чат и отправь.
          </p>

          <div className="order-next-steps">
            <article>
              <strong>1</strong>
              <p>Нажми кнопку ниже — откроется чат в Telegram.</p>
            </article>
            <article>
              <strong>2</strong>
              <p>Сообщение заказа уже будет скопировано. Просто вставь его в чат.</p>
            </article>
            <article>
              <strong>3</strong>
              <p>Мы подберём 3 подходящих варианта, и ты быстро оформишь заказ.</p>
            </article>
          </div>

          <button className="primary-button" onClick={openTelegram}>Открыть Telegram и вставить сообщение</button>
          {copied && <p className="subtle">Сообщение скопировано. В Telegram нажми в поле ввода и выбери “Вставить”.</p>}
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

function Header({ step, onBack, note = "2 минуты · без анкеты" }: { step: number; onBack: () => void; note?: string }) {
  if (step === 0) {
    return (
      <header className="topbar start-topbar">
        <span className="brand-mark">Flower ID</span>
        <span className="start-topbar-note">{note}</span>
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

type ArchetypeVisual = {
  title: string;
  description: string;
  image?: string;
  imagePosition?: string;
  spriteIndex: number;
};

type ArchetypeResultDefault = {
  name: string;
  description: string;
  tags: string[];
  palette: Array<{ name: string; color: string }>;
  flowers: string[];
  avoid: string[];
  scent: string;
  packaging: string;
  ideal: string;
  visuals: ArchetypeVisual[];
};

const archetypeResultDefaults: Record<ArchetypeId, ArchetypeResultDefault> = {
  garden_romance: {
    name: "Садовая романтика",
    description: "Нежный, живой и романтичный стиль с ощущением сада и мягкой заботы.",
    tags: ["нежно", "садово", "воздушно", "романтично"],
    palette: [
      { name: "пудровый", color: "#e8b9c5" },
      { name: "кремовый", color: "#fff1dd" },
      { name: "светлая зелень", color: "#cfe4bd" },
      { name: "розовый", color: "#f4b6c8" },
    ],
    flowers: ["Пионы", "Ранункулюсы", "Пионовидные розы", "Анемоны", "Фрезии"],
    avoid: ["Слишком яркие букеты", "Много упаковки"],
    scent: "лёгкий или нейтральный",
    packaging: "мягкая, натуральная, без лишнего декора",
    ideal: "Воздушная композиция в молочно-пудровой гамме с ранункулюсами, пионами и лёгкой зеленью.",
    visuals: [
      { title: "Нежный", description: "Мягкая палитра, лёгкая форма, минимум упаковки", image: "/archetypes/garden-romance.jpg", spriteIndex: 0 },
      { title: "Премиальный", description: "Больше объёма, редкие цветы, тихая роскошь", image: "/archetypes/classic-femininity.jpg", spriteIndex: 4 },
      { title: "Необычный", description: "Тот же стиль, но с арт-акцентом", image: "/archetypes/paris-morning.jpg", spriteIndex: 10 },
    ],
  },
  white_green_minimalism: {
    name: "Мягкий минимализм",
    description: "Чистый, свежий и элегантный стиль без лишней декоративности.",
    tags: ["чисто", "свежо", "воздушно", "минималистично"],
    palette: [
      { name: "молочный", color: "#ffffff" },
      { name: "айвори", color: "#f4ecd7" },
      { name: "шалфейный", color: "#aebf9b" },
      { name: "эвкалипт", color: "#6c957d" },
    ],
    flowers: ["Анемоны", "Каллы", "Ранункулюсы", "Фрезии", "Тюльпаны"],
    avoid: ["Блёстки", "Пёстрые букеты", "Глянцевая упаковка"],
    scent: "нейтральный или очень лёгкий",
    packaging: "минималистичная, без лишнего декора",
    ideal: "Чистая бело-зелёная композиция с лёгкой формой, спокойной зеленью и аккуратной упаковкой.",
    visuals: [
      { title: "Нежный", description: "Молочный, шалфейный, мягкая форма", image: "/archetypes/white-green-minimalism.jpg", spriteIndex: 1 },
      { title: "Премиальный", description: "Белая гамма, редкие цветы, тихая роскошь", image: "/archetypes/quiet-luxury.jpg", spriteIndex: 7 },
      { title: "Необычный", description: "Минимализм с графичным акцентом", image: "/archetypes/art-experiment.jpg", spriteIndex: 10 },
    ],
  },
  dramatic_elegance: {
    name: "Драматичная элегантность",
    description: "Глубокий, вечерний и выразительный стиль с сильным характером.",
    tags: ["глубоко", "элегантно", "вечерне", "выразительно"],
    palette: [
      { name: "бордо", color: "#7a1531" },
      { name: "сливовый", color: "#63305f" },
      { name: "темная вишня", color: "#4d0b1d" },
      { name: "пудровый", color: "#ddb7c2" },
    ],
    flowers: ["Каллы", "Орхидеи", "Анемоны", "Пионовидные розы"],
    avoid: ["Слишком простые букеты", "Случайные яркие миксы"],
    scent: "умеренный, без резкости",
    packaging: "сдержанная, глубоких оттенков",
    ideal: "Выразительный букет в винно-ягодной гамме с крупной формой и элегантной подачей.",
    visuals: [
      { title: "Драма", description: "Винные оттенки и вечерний объём", image: "/archetypes/dramatic-elegance.jpg", spriteIndex: 3 },
      { title: "Премиальный", description: "Глубокая палитра и крупные акценты", image: "/archetypes/evening-wow.jpg", spriteIndex: 8 },
      { title: "Графичный", description: "Контраст и архитектурная форма", image: "/archetypes/art-experiment.jpg", spriteIndex: 6 },
    ],
  },
  sunny_joy: {
    name: "Солнечная энергия",
    description: "Тёплый, радостный и живой стиль, который сразу поднимает настроение.",
    tags: ["ярко", "радостно", "тепло", "сочно"],
    palette: [
      { name: "желтый", color: "#ffd43b" },
      { name: "оранжевый", color: "#ff8a3d" },
      { name: "коралл", color: "#ff6f61" },
      { name: "розовый", color: "#ee9aac" },
    ],
    flowers: ["Тюльпаны", "Герберы", "Полевые цветы", "Гортензии"],
    avoid: ["Слишком строгие букеты", "Мрачные оттенки"],
    scent: "лёгкий, свежий",
    packaging: "простая, чтобы не спорить с цветом",
    ideal: "Светлый сезонный микс в тёплых оттенках с ощущением праздника и живой энергии.",
    visuals: [
      { title: "Солнечный", description: "Жёлтый, коралл, летний микс", image: "/archetypes/sunny-joy.jpg", spriteIndex: 2 },
      { title: "Праздничный", description: "Больше цвета и заметный объём", image: "/archetypes/evening-wow.jpg", spriteIndex: 8 },
      { title: "Натуральный", description: "Яркость через сезонные цветы", image: "/archetypes/wild-garden.jpg", spriteIndex: 5 },
    ],
  },
  wild_garden: {
    name: "Дикий сад",
    description: "Свободный природный стиль, будто букет собран в красивом саду.",
    tags: ["природно", "живо", "свободно", "небрежно"],
    palette: [
      { name: "оливковый", color: "#758a4c" },
      { name: "песочный", color: "#e2c991" },
      { name: "ромашковый", color: "#fff7b8" },
      { name: "небо", color: "#8bb7cf" },
    ],
    flowers: ["Полевые цветы", "Ромашки", "Астильба", "Эвкалипт", "Сирень"],
    avoid: ["Слишком глянцевую упаковку", "Искусственный декор"],
    scent: "свежий, натуральный",
    packaging: "крафт или натуральная",
    ideal: "Свободный букет с полевыми фактурами, зеленью и ощущением естественного движения.",
    visuals: [
      { title: "Природный", description: "Свободная форма и садовые фактуры", image: "/archetypes/wild-garden.jpg", spriteIndex: 5 },
      { title: "Тёплый", description: "Крафт, зелень и сезонные оттенки", image: "/archetypes/paris-morning.jpg", spriteIndex: 0 },
      { title: "Артистичный", description: "Асимметрия без лишней нарядности", image: "/archetypes/art-experiment.jpg", spriteIndex: 10 },
    ],
  },
  art_experiment: {
    name: "Арт-эксперимент",
    description: "Необычный, дизайнерский и немного архитектурный стиль.",
    tags: ["арт", "необычно", "графично", "смело"],
    palette: [
      { name: "фиолетовый", color: "#7443a8" },
      { name: "лайм", color: "#c7e84b" },
      { name: "темный", color: "#252833" },
      { name: "контраст", color: "#ffffff" },
    ],
    flowers: ["Орхидеи", "Антуриумы", "Каллы", "Протея"],
    avoid: ["Слишком шаблонные букеты", "Банальную классику"],
    scent: "нейтральный, чтобы форма была главной",
    packaging: "лаконичная, дизайнерская",
    ideal: "Архитектурная композиция с необычным цветком, чистой линией и смелым акцентом.",
    visuals: [
      { title: "Необычный", description: "Орхидеи, графика и контраст", image: "/archetypes/art-experiment.jpg", spriteIndex: 6 },
      { title: "Скульптурный", description: "Асимметрия и дизайнерская форма", image: "/archetypes/dramatic-elegance.jpg", spriteIndex: 10 },
      { title: "Премиальный", description: "Редкие цветы без лишнего декора", image: "/archetypes/quiet-luxury.jpg", spriteIndex: 7 },
    ],
  },
  quiet_luxury: {
    name: "Тихая роскошь",
    description: "Дорогой, спокойный и очень собранный стиль без демонстративности.",
    tags: ["дорого", "сдержанно", "мягко", "элегантно"],
    palette: [
      { name: "айвори", color: "#f6edd7" },
      { name: "шампань", color: "#d8d2bb" },
      { name: "шалфейный", color: "#879d83" },
      { name: "молочный", color: "#fffaf6" },
    ],
    flowers: ["Каллы", "Орхидеи", "Ранункулюсы", "Пионовидные розы"],
    avoid: ["Кислотные оттенки", "Блёстки", "Слишком много упаковки"],
    scent: "лёгкий или нейтральный",
    packaging: "премиальная и сдержанная",
    ideal: "Спокойная композиция в айвори-шампань гамме с дорогой фактурой и чистой подачей.",
    visuals: [
      { title: "Тихая роскошь", description: "Айвори, шампань, мягкий объём", image: "/archetypes/quiet-luxury.jpg", spriteIndex: 7 },
      { title: "Чистый", description: "Бело-зелёная свежесть", image: "/archetypes/white-green-minimalism.jpg", spriteIndex: 1 },
      { title: "Вечерний", description: "Глубже, но всё ещё сдержанно", image: "/archetypes/dramatic-elegance.jpg", spriteIndex: 3 },
    ],
  },
  classic_femininity: {
    name: "Классическая нежность",
    description: "Понятный, женственный и гармоничный стиль, который выглядит уместно всегда.",
    tags: ["классика", "мягко", "гармонично", "женственно"],
    palette: [
      { name: "розовый", color: "#fac9d1" },
      { name: "кремовый", color: "#f8ead4" },
      { name: "зелень", color: "#9fbf92" },
      { name: "пудровый", color: "#e9aabc" },
    ],
    flowers: ["Пионовидные розы", "Гортензии", "Пионы", "Тюльпаны"],
    avoid: ["Слишком странные формы", "Жёсткие контрасты"],
    scent: "мягкий, без навязчивости",
    packaging: "романтичная или аккуратная",
    ideal: "Округлый гармоничный букет в розово-кремовой гамме с мягкой зеленью и понятной красотой.",
    visuals: [
      { title: "Классический", description: "Округлая форма и мягкая палитра", image: "/archetypes/classic-femininity.jpg", spriteIndex: 11 },
      { title: "Романтичный", description: "Пионы и пудровые оттенки", image: "/archetypes/garden-romance.jpg", spriteIndex: 4 },
      { title: "Премиальный", description: "Больше объёма и дорогой фактуры", image: "/archetypes/quiet-luxury.jpg", spriteIndex: 7 },
    ],
  },
  paris_morning: {
    name: "Парижское утро",
    description: "Лёгкий, свежий и стильный букет с ощущением красивого утра.",
    tags: ["лёгко", "свежо", "небрежно", "стильно"],
    palette: [
      { name: "молочный", color: "#fff4d6" },
      { name: "лиловый", color: "#c7a7dd" },
      { name: "пудровый", color: "#e3adc4" },
      { name: "серо-зеленый", color: "#9fb7aa" },
    ],
    flowers: ["Тюльпаны", "Анемоны", "Ранункулюсы", "Фрезии"],
    avoid: ["Тяжёлые букеты", "Слишком торжественную упаковку"],
    scent: "лёгкий",
    packaging: "минималистичная или натуральная",
    ideal: "Лёгкий букет с тюльпанами, анемонами и мягкими пастельными оттенками.",
    visuals: [
      { title: "Утренний", description: "Тюльпаны, воздух и пастель", image: "/archetypes/paris-morning.jpg", spriteIndex: 9 },
      { title: "Нежный", description: "Лёгкая форма и мягкие оттенки", image: "/archetypes/garden-romance.jpg", spriteIndex: 0 },
      { title: "Графичный", description: "Анемоны как тонкий акцент", image: "/archetypes/art-experiment.jpg", spriteIndex: 10 },
    ],
  },
  evening_wow: {
    name: "Вечерний вау",
    description: "Масштабный, заметный и праздничный стиль для сильного впечатления.",
    tags: ["вау", "объёмно", "ярко", "празднично"],
    palette: [
      { name: "насыщенный розовый", color: "#d33f6a" },
      { name: "красный", color: "#7b1637" },
      { name: "фуксия", color: "#e6538f" },
      { name: "пудровый", color: "#ffabc4" },
    ],
    flowers: ["Пионовидные розы", "Гортензии", "Орхидеи", "Каллы"],
    avoid: ["Слишком маленькие букеты", "Скучную упаковку"],
    scent: "умеренный",
    packaging: "премиальная, но не перегруженная",
    ideal: "Большой вау-букет с выразительной палитрой, объёмом и аккуратной праздничной подачей.",
    visuals: [
      { title: "Вау", description: "Масштаб и насыщенный цвет", image: "/archetypes/evening-wow.jpg", spriteIndex: 8 },
      { title: "Драма", description: "Вечерний характер и глубина", image: "/archetypes/dramatic-elegance.jpg", spriteIndex: 3 },
      { title: "Праздник", description: "Яркий микс без хаоса", image: "/archetypes/sunny-joy.jpg", spriteIndex: 2 },
    ],
  },
};

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
  const publicOrderLink = requestId ? `${publicLink}?requestId=${encodeURIComponent(requestId)}` : publicLink;
  const referralLink = requestId ? publicOrderLink : `${publicLink}?ref=${submissionId}`;
  const hardNo = getBouquetHardNo(answers);
  const name = answers.user.name || "Получатель";
  const isShared = context === "shared";
  const resultView = isShared ? "publicView" : "ownerView";
  const defaults = archetypeResultDefaults[profile.primary_archetype];
  const resultData = getResultData(answers, profile, hardNo);
  const copyText = `${profile.share_text}\nFlower ID:\n${publicOrderLink}`;
  const resultUrl = submissionId ? `${window.location.origin}/result/${submissionId}` : window.location.href;

  const copy = async (text: string, eventName: string) => {
    await navigator.clipboard.writeText(text);
    track(eventName, { submissionId, archetype: profile.primary_archetype, view: resultView });
    onToast("Скопировано");
  };

  const share = async () => {
    const text = isShared
      ? `Flower ID ${name}: ${referralLink}`
      : `Вот мой Flower ID. Здесь мой стиль, палитра и подсказки, что лучше не дарить: ${referralLink}`;
    if (navigator.share) {
      await navigator.share({ title: "Мой цветочный портрет", text, url: publicOrderLink });
      track("share_clicked", { submissionId, archetype: profile.primary_archetype, view: resultView, shareType: "web_share" });
    } else {
      await copy(text, "share_clicked");
    }
  };
  const order = () => {
    const target = document.getElementById("result-order-panel");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const message = buildOrderMessage(answers, profile, publicOrderLink, requestId);
    openOrder(message, { submissionId, requestId, archetypeId: profile.primary_archetype });
  };
  const saveSharedResult = () => {
    track("shared_result_saved_clicked", { submissionId, archetype: profile.primary_archetype, view: resultView });
    navigate("/my-flower-id");
  };

  return (
    <section className="screen result-screen premium-result-screen">
      <header className="result-brand-header">
        <span className="brand-mark">Flower ID</span>
        <span>для букетов без ошибок</span>
      </header>

      {requestId && context === "own" && (
        <article className="message-card result-ready-note">
          <strong>Flower ID готов</strong>
          <p>Теперь можно отправить его тому, кто запросил, чтобы он подобрал букет в твоём стиле.</p>
        </article>
      )}

      <ResultHero
        name={name}
        archetypeName={defaults.name}
        title={isShared ? `Flower ID ${name}` : "Твой Flower ID готов"}
        subtitle={isShared ? `Теперь понятно, какие букеты действительно подходят для ${name}.` : "Теперь близким проще выбрать букет, который действительно тебе подходит."}
        description={isShared ? makePublicResultText(resultData.description) : resultData.description}
        tags={resultData.tags}
        submissionId={submissionId}
      />

      <ResultActions
        isShared={isShared}
        name={name}
        onShare={share}
        onOrder={order}
        onCopyLink={() => copy(resultUrl, "copy_link_clicked")}
        onCopyProfile={isShared ? saveSharedResult : () => copy(copyText, "profile_copied")}
        onRequestAnother={() => {
          track("request_another_clicked", { source: "result", submissionId, archetype: profile.primary_archetype, view: resultView });
          navigate("/request");
        }}
        onCreateOwn={() => {
          track("shared_result_create_own_clicked", { referrerId: submissionId, archetype: profile.primary_archetype, view: resultView });
          navigate(`/?ref=${encodeURIComponent(submissionId)}`);
        }}
      />

      <ArchetypeVisualReferences visuals={resultData.visuals} name={name} isShared={isShared} />

      <FlowerIdProfileCard data={resultData} name={name} isShared={isShared} />

      {!isShared && <ResultFeedback submissionId={submissionId} archetype={profile.primary_archetype} view={resultView} />}

      <SharedResultOrderPanel
        answers={answers}
        profile={profile}
        publicLink={publicOrderLink}
        requestId={requestId}
        submissionId={submissionId}
        navigate={navigate}
      />

      <div className="result-secondary-actions">
        {isShared && <button className="primary-button" onClick={order}>Заказать цветы</button>}
        {!isShared && <button className="primary-button" onClick={share}>Поделиться</button>}
        {!isShared && onEdit && <button className="secondary-button" onClick={onEdit}>Редактировать Flower ID</button>}
        {!isShared && <button className="secondary-button" onClick={() => navigate("/my-flower-id")}>Мои Flower ID</button>}
        {!isShared && <button className="text-button" onClick={onRestart}>Пройти заново</button>}
      </div>
    </section>
  );
}

function ResultHero({
  name,
  archetypeName,
  title,
  subtitle,
  description,
  tags,
  submissionId,
}: {
  name: string;
  archetypeName: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  submissionId: string;
}) {
  return (
    <section className="result-hero-card">
      <div className="result-hero-copy">
        <p className="eyebrow">{title}</p>
        {submissionId && <span className="flower-id-pill">{formatFlowerId(submissionId)}</span>}
        <h1 className="result-identity">
          <span>{name}</span>
          <small>{archetypeName}</small>
        </h1>
        <p className="lead">{subtitle}</p>
        <p className="result-emotional-description">{description}</p>
        <div className="result-style-tags" aria-label="Стиль Flower ID">
          {tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </div>
      <div className="result-hero-mark" aria-hidden="true">
        <span>Flower ID</span>
      </div>
    </section>
  );
}

function ArchetypeVisualReferences({ visuals, name, isShared }: { visuals: ArchetypeVisual[]; name: string; isShared: boolean }) {
  return (
    <section className="result-section">
      <div className="result-section-heading">
        <p className="eyebrow">Визуальные референсы</p>
        <h2>{isShared ? `Как выглядит стиль ${name}` : "Как выглядит твой стиль"}</h2>
      </div>
      <div className="visual-reference-row">
        {visuals.map((visual, index) => (
          <article className="visual-reference-card" key={`${visual.title}-${index}`}>
            <div
              className="visual-reference-image"
              style={
                visual.image
                  ? {
                    backgroundImage: `url(${visual.image})`,
                    backgroundPosition: visual.imagePosition ?? "center",
                    backgroundSize: "cover",
                  }
                  : bouquetPhotoStyle(visual.spriteIndex)
              }
              aria-hidden="true"
            />
            <div>
              <h3>{visual.title}</h3>
              <p>{visual.description}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="result-disclaimer">
        Изображения показывают стиль и настроение. Финальный букет собирается флористом с учётом сезона и наличия цветов.
      </p>
    </section>
  );
}

function FlowerIdProfileCard({
  data,
  name,
  isShared,
}: {
  data: ReturnType<typeof getResultData>;
  name: string;
  isShared: boolean;
}) {
  return (
    <article className="flower-id-profile-card">
      <ProfileSection title={isShared ? "Стиль Flower ID" : "Твой стиль"}>
        <p>{isShared ? makePublicResultText(data.styleText) : data.styleText}</p>
        <div className="result-style-tags compact">
          {data.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </ProfileSection>

      <ProfileSection title={isShared ? "Палитра Flower ID" : "Твоя палитра"}>
        <PaletteSwatches palette={data.palette} />
      </ProfileSection>

      <ProfileSection title={isShared ? "Подойдут к этому Flower ID" : "Тебе подойдут"}>
        <ChipList items={data.flowers} fallback="Флорист подберёт цветы по выбранному стилю." />
      </ProfileSection>

      <ProfileSection title="Лучше не дарить" tone="warning">
        <ChipList items={data.avoid} fallback="Жёсткого стоп-листа нет." />
      </ProfileSection>

      <div className="result-detail-grid">
        <ProfileSection title="Аромат">
          <p>{data.scent}</p>
        </ProfileSection>
        <ProfileSection title="Упаковка">
          <p>{data.packaging}</p>
        </ProfileSection>
      </div>

      <ProfileSection title={isShared ? "Идеальный букет по Flower ID" : "Идеальный букет"} tone="ideal">
        <p>{data.ideal}</p>
      </ProfileSection>
    </article>
  );
}

function ProfileSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "warning" | "ideal";
  children: ReactNode;
}) {
  return (
    <section className={`profile-section ${tone ? `profile-section-${tone}` : ""}`}>
      <span>{title}</span>
      {children}
    </section>
  );
}

function PaletteSwatches({ palette }: { palette: Array<{ name: string; color: string }> }) {
  return (
    <div className="result-palette-list">
      <div className="result-palette-dots" aria-hidden="true">
        {palette.map((item) => <i key={`${item.name}-${item.color}`} style={{ background: item.color }} />)}
      </div>
      <p>{palette.map((item) => item.name).join(" · ")}</p>
    </div>
  );
}

function ChipList({ items, fallback }: { items: string[]; fallback: string }) {
  const values = items.filter(Boolean).filter(unique).slice(0, 8);
  if (!values.length) return <p>{fallback}</p>;
  return (
    <div className="result-chip-list">
      {values.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function ResultActions({
  isShared,
  name,
  onShare,
  onOrder,
  onCopyLink,
  onCopyProfile,
  onRequestAnother,
  onCreateOwn,
}: {
  isShared: boolean;
  name: string;
  onShare: () => void;
  onOrder: () => void;
  onCopyLink: () => void;
  onCopyProfile: () => void;
  onRequestAnother: () => void;
  onCreateOwn: () => void;
}) {
  return (
    <section className="result-actions-panel">
      <button className="primary-button" onClick={isShared ? onOrder : onShare}>
        {isShared ? `Подобрать букет для ${name}` : "Поделиться моим Flower ID"}
      </button>
      <button className="ghost-button" onClick={isShared ? onCopyProfile : onOrder}>
        {isShared ? "Сохранить" : "Подобрать букет по моему Flower ID"}
      </button>
      <button className="secondary-button" onClick={isShared ? onCreateOwn : onRequestAnother}>
        {isShared ? "Создать свой Flower ID" : "Узнать Flower ID другого человека →"}
      </button>
      <button className="text-button" onClick={onCopyLink}>Скопировать ссылку</button>
    </section>
  );
}

function ResultFeedback({
  submissionId,
  archetype,
  view,
}: {
  submissionId: string;
  archetype: ArchetypeId;
  view: string;
}) {
  const [selected, setSelected] = useState("");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const needsComment = selected === "partial" || selected === "no";

  const choose = (value: string) => {
    setSelected(value);
    setSent(false);
    track("result_feedback_clicked", { submissionId, archetype, view, value });
    saveResultFeedback({
      id: createId("fb"),
      submissionId,
      archetype,
      view,
      phase: "clicked",
      value,
      comment: "",
      created_at: new Date().toISOString(),
    });
  };

  const submit = () => {
    track("result_feedback_submitted", { submissionId, archetype, view, value: selected, comment });
    saveResultFeedback({
      id: createId("fb"),
      submissionId,
      archetype,
      view,
      phase: "submitted",
      value: selected,
      comment,
      created_at: new Date().toISOString(),
    });
    setSent(true);
  };

  return (
    <section className="result-feedback-card">
      <h2>Похоже на тебя?</h2>
      <div className="feedback-buttons">
        <button className={selected === "yes" ? "selected" : ""} onClick={() => choose("yes")}>Да, очень</button>
        <button className={selected === "partial" ? "selected" : ""} onClick={() => choose("partial")}>Частично</button>
        <button className={selected === "no" ? "selected" : ""} onClick={() => choose("no")}>Не очень</button>
      </div>
      {needsComment && (
        <div className="feedback-comment">
          <label>
            Что не совпало?
            <textarea
              className="text-area"
              value={comment}
              placeholder="Например: не люблю розовый, люблю более яркие букеты…"
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <button className="secondary-button" onClick={submit}>Отправить</button>
        </div>
      )}
      {selected === "yes" && !sent && <p className="subtle">Спасибо — сохранили обратную связь.</p>}
      {sent && <p className="subtle">Спасибо, это поможет сделать Flower ID точнее.</p>}
    </section>
  );
}

function makePublicResultText(text: string) {
  return text
    .replace(/^Вам ближе букеты, которые /, "Ближе букеты, которые ")
    .replace(/^Вам ближе /, "Ближе ")
    .replace(/^Вам подходят /, "Подходят ")
    .replace(/^Вам подходит /, "Подходит ")
    .replace(/^Вам близка /, "Близка ")
    .replace(/^Вам нужен /, "Нужен ")
    .replace(/^Ваш идеальный букет /, "Идеальный букет ")
    .replace(/^Ваш стиль про /, "Стиль про ")
    .replace(/^Ваш стиль /, "Стиль ")
    .replace(/^Ваш букет /, "Букет ")
    .replace(/^Вы выбираете сдержанную красоту/, "В профиле — сдержанная красота")
    .replace(/\bВам\b/g, "Получателю")
    .replace(/\bвам\b/g, "получателю")
    .replace(/\bВаш\b/g, "Этот")
    .replace(/\bваш\b/g, "этот");
}

function PublicOrderPanel({
  payload,
  archetypeId,
  requestId,
  navigate,
}: {
  payload: {
    name: string;
    flower_id?: string;
    title: string;
    preferred_format: string;
  };
  archetypeId: ArchetypeId;
  requestId?: string | null;
  navigate: (url: string) => void;
}) {
  const [draft, setDraft] = useState<OrderDraft>(createEmptyOrderDraft());
  const canOrder = canSubmitOrder(draft);
  const message = [
    requestId
      ? "Здравствуйте! Я получил Flower ID по запросу и хочу заказать букет по этому профилю."
      : "Здравствуйте! Хочу заказать букет по Flower ID.",
    "",
    `Получатель: ${payload.name || "не указано"}`,
    `Flower ID: ${payload.title}`,
    payload.flower_id ? `ID: ${payload.flower_id}` : "",
    `Формат: ${payload.preferred_format}`,
    `Бюджет: ${draft.budget || "не указан"}`,
    `Повод: ${draft.occasion || "не указан"}`,
    draft.deliveryDate ? `Дата/время: ${draft.deliveryDate}` : "",
    draft.deliveryDetails ? `Доставка/самовывоз: ${draft.deliveryDetails}` : "",
    draft.senderName ? `Заказчик: ${draft.senderName}` : "",
    draft.senderContact ? `Контакт: ${draft.senderContact}` : "",
    draft.comment ? `Комментарий: ${draft.comment}` : "",
    requestId ? `Request ID: ${requestId}` : "",
    `Ссылка: ${window.location.href}`,
  ]
    .filter(Boolean)
    .join("\n");
  const submitOrder = () => {
    const order = createFlowerOrder({
      draft,
      message,
      source: "public_profile",
      submissionId: payload.flower_id || "public_profile",
      requestId,
      flowerId: payload.flower_id || "",
      recipientName: payload.name || "не указано",
      archetype: archetypeId,
    });
    saveFlowerOrder(order);
    navigate(`/order-next/${order.id}`);
  };

  return (
    <section className="order-panel">
      <p className="eyebrow">Для дарителя</p>
      <h2>Заказать букет по Flower ID</h2>
      <p>Добавь детали заказа, чтобы флорист собрал варианты уже с учётом профиля.</p>
      <OrderFields draft={draft} onChange={setDraft} />
      <OrderBriefPreview title="Что получит флорист" message={message} />
      <button
        className="primary-button"
        disabled={!canOrder}
        onClick={submitOrder}
      >
        Заказать букет
      </button>
      {!canOrder && <p className="subtle">Чтобы оформить заказ, заполни бюджет, повод и контакт для связи.</p>}
    </section>
  );
}

function SharedResultOrderPanel({
  answers,
  profile,
  publicLink,
  requestId,
  submissionId,
  navigate,
}: {
  answers: Answers;
  profile: ComputedProfile;
  publicLink: string;
  requestId?: string | null;
  submissionId: string;
  navigate: (url: string) => void;
}) {
  const [draft, setDraft] = useState<OrderDraft>(createEmptyOrderDraft());
  const message = buildOrderMessage(answers, profile, publicLink, requestId, draft);
  const canOrder = canSubmitOrder(draft);
  const submitOrder = () => {
    const order = createFlowerOrder({
      draft,
      message,
      source: "result",
      submissionId,
      requestId,
      flowerId: formatFlowerId(submissionId),
      recipientName: answers.user.name || "не указано",
      archetype: profile.primary_archetype,
    });
    saveFlowerOrder(order);
    navigate(`/order-next/${order.id}`);
  };

  return (
    <section className="order-panel" id="result-order-panel">
      <p className="eyebrow">Заказ букета</p>
      <h2>Заказать цветы по Flower ID</h2>
      <p>Заполни короткий бриф. Мы сохраним заявку и откроем Telegram с сообщением для флориста.</p>
      <OrderFields draft={draft} onChange={setDraft} />
      <OrderBriefPreview title="Что получит флорист" message={message} />
      <button className="primary-button" disabled={!canOrder} onClick={submitOrder}>Заказать цветы</button>
      {!canOrder && <p className="subtle">Чтобы оформить заказ, заполни бюджет, повод и контакт для связи.</p>}
    </section>
  );
}

function OrderFields({ draft, onChange }: { draft: OrderDraft; onChange: (draft: OrderDraft) => void }) {
  return (
    <div className="contact-panel order-fields">
      <label>Бюджет<input value={draft.budget} placeholder="Например: 12 000–15 000 ₽" onChange={(event) => onChange({ ...draft, budget: event.target.value })} /></label>
      <label>Повод<input value={draft.occasion} placeholder="День рождения, свидание, просто так" onChange={(event) => onChange({ ...draft, occasion: event.target.value })} /></label>
      <label>Когда нужен букет<input value={draft.deliveryDate} placeholder="Сегодня вечером, 24 мая к 18:00" onChange={(event) => onChange({ ...draft, deliveryDate: event.target.value })} /></label>
      <label>Доставка или самовывоз<input value={draft.deliveryDetails} placeholder="Адрес, район или самовывоз" onChange={(event) => onChange({ ...draft, deliveryDetails: event.target.value })} /></label>
      <label>Ваше имя<input value={draft.senderName} placeholder="Сергей" onChange={(event) => onChange({ ...draft, senderName: event.target.value })} /></label>
      <label>Контакт для связи<input value={draft.senderContact} placeholder="@telegram или телефон" onChange={(event) => onChange({ ...draft, senderContact: event.target.value })} /></label>
      <label>Комментарий<textarea className="text-area" value={draft.comment} placeholder="Например: хочется нежно, без сильного аромата, доставка сюрпризом" onChange={(event) => onChange({ ...draft, comment: event.target.value })} /></label>
    </div>
  );
}

function OrderBriefPreview({ title, message }: { title: string; message: string }) {
  return (
    <details className="order-brief-preview">
      <summary>{title}</summary>
      <pre>{message}</pre>
    </details>
  );
}

function getResultData(answers: Answers, profile: ComputedProfile, hardNo: string[]) {
  const defaults = archetypeResultDefaults[profile.primary_archetype];
  const palette = getResultPalette(answers, profile, defaults);
  const flowers = (profile.favorite_flowers.length ? profile.favorite_flowers : defaults.flowers).filter(unique).slice(0, 7);
  const avoid = [
    ...profile.avoid_flowers,
    ...profile.avoid_colors,
    ...hardNo,
    ...answers.packaging_stoplist
      .filter((id) => id !== "no_hard_bans")
      .map((id) => packagingStopOptions.find((option) => option.id === id)?.label ?? id),
    answers.allergies.has_allergy ? answers.allergies.comment || "Аллергены и сильные ароматы" : "",
  ].filter(Boolean).filter(unique);
  const scent = getScentLabel(answers) || defaults.scent;
  const packaging = getPackagingLabel(answers) || defaults.packaging;
  const ideal = buildIdealBouquetText(palette, flowers, packaging, defaults);

  return {
    description: profile.description || defaults.description,
    styleText: defaults.description,
    tags: (profile.emotion.length ? [...profile.emotion, ...defaults.tags] : defaults.tags).filter(unique).slice(0, 4),
    palette,
    flowers,
    avoid: avoid.length ? avoid.slice(0, 8) : defaults.avoid,
    scent,
    packaging,
    ideal,
    visuals: defaults.visuals,
  };
}

function getResultPalette(answers: Answers, profile: ComputedProfile, defaults: ArchetypeResultDefault) {
  const paletteIds = [answers.ideal_palette, ...answers.favorite_palettes]
    .filter(Boolean)
    .filter((id) => id !== "florist_palette")
    .filter(unique);
  const selected = paletteIds.flatMap((id) => {
    const palette = palettes.find((item) => item.id === id);
    if (!palette?.colors?.length) return [];
    const names = palette.description?.split(", ") ?? [];
    return palette.colors.map((color, index) => ({ name: names[index] ?? palette.label.toLowerCase(), color }));
  });

  if (selected.length) return selected.filter((item, index, list) => list.findIndex((other) => other.name === item.name) === index).slice(0, 5);
  if (profile.preferred_colors.length) {
    return profile.preferred_colors.slice(0, 5).map((name, index) => ({
      name,
      color: defaults.palette[index % defaults.palette.length]?.color ?? "#d9cec2",
    }));
  }
  return defaults.palette;
}

function getScentLabel(answers: Answers) {
  const scentMap: Record<string, string> = {
    aromatic: "можно ароматный, если он мягкий",
    light: "лёгкий или нейтральный",
    none: "без выраженного запаха",
    sensitive: "без сильного аромата",
  };
  const allergyMap: Record<string, string> = {
    scent_sensitive: "без сильного аромата",
    allergy: answers.allergies.comment ? `есть ограничения: ${answers.allergies.comment}` : "учесть аллергии и избегать резких ароматов",
    unknown: "лучше нейтральный",
  };
  return allergyMap[answers.allergies.kind] || scentMap[answers.fragrance] || "";
}

function getPackagingLabel(answers: Answers) {
  return answers.packaging
    .map((id) => packagingOptions.find((option) => option.id === id)?.label.toLowerCase() ?? id)
    .filter(Boolean)
    .join(", ");
}

function buildIdealBouquetText(
  palette: Array<{ name: string; color: string }>,
  flowers: string[],
  packaging: string,
  defaults: ArchetypeResultDefault,
) {
  const paletteText = palette.slice(0, 3).map((item) => item.name).join(", ");
  const flowersText = flowers.slice(0, 3).join(", ");
  if (!paletteText && !flowersText) return defaults.ideal;
  return [
    "Композиция",
    paletteText ? `в гамме ${paletteText}` : "",
    flowersText ? `с акцентом на ${flowersText}` : "",
    packaging ? `и подачей: ${packaging}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() + ".";
}

function unique<T>(value: T, index: number, array: T[]) {
  return array.indexOf(value) === index;
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
  if (id.startsWith("FID-")) return id;
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

function requestStatusCopy(status: FlowerRequest["status"]) {
  const map = {
    created: {
      label: "Ожидает",
      title: "Запрос создан",
      text: "Отправь ссылку получателю. Как только он откроет её и начнёт квиз, статус обновится.",
    },
    opened: {
      label: "Открыт",
      title: "Ссылку уже открыли",
      text: "Получатель видел запрос. Осталось пройти короткий квиз и сохранить Flower ID.",
    },
    started_quiz: {
      label: "В процессе",
      title: "Квиз начат",
      text: "Получатель уже собирает Flower ID. Когда результат будет готов, здесь появится карточка.",
    },
    completed: {
      label: "Готово",
      title: "Flower ID готов",
      text: "Можно открыть карточку и заказать букет по профилю.",
    },
  } satisfies Record<FlowerRequest["status"], { label: string; title: string; text: string }>;
  return map[status];
}

function findArchetypeByTitle(title: string): ArchetypeId {
  const exact = Object.entries(archetypeResultDefaults).find(([, value]) => title.includes(value.name));
  if (exact) return exact[0] as ArchetypeId;
  return "garden_romance";
}

function createEmptyOrderDraft(): OrderDraft {
  return {
    budget: "",
    occasion: "",
    deliveryDate: "",
    deliveryDetails: "",
    senderName: "",
    senderContact: "",
    comment: "",
  };
}

function canSubmitOrder(draft: OrderDraft) {
  return Boolean(draft.budget.trim() && draft.occasion.trim() && draft.senderContact.trim());
}

function createFlowerOrder({
  draft,
  message,
  source,
  submissionId,
  requestId,
  flowerId,
  recipientName,
  archetype,
}: {
  draft: OrderDraft;
  message: string;
  source: FlowerOrder["source"];
  submissionId: string;
  requestId?: string | null;
  flowerId: string;
  recipientName: string;
  archetype: FlowerOrder["archetype"];
}): FlowerOrder {
  return {
    id: createId("ord"),
    submissionId,
    requestId,
    archetype,
    recipientName,
    flowerId,
    budget: draft.budget.trim(),
    occasion: draft.occasion.trim(),
    deliveryDate: draft.deliveryDate.trim(),
    deliveryDetails: draft.deliveryDetails.trim(),
    senderName: draft.senderName.trim(),
    senderContact: draft.senderContact.trim(),
    comment: draft.comment.trim(),
    source,
    status: "created",
    message,
    created_at: new Date().toISOString(),
  };
}

function buildOrderMessage(answers: Answers, profile: ComputedProfile, link: string, requestId?: string | null, order?: OrderDraft) {
  const recipient = answers.user.name || "не указано";
  return [
    requestId
      ? "Здравствуйте! Я запросил Flower ID у получателя и хочу заказать букет по результату."
      : "Здравствуйте! Хочу подобрать букет по Flower ID.",
    "",
    `Получатель: ${recipient}`,
    `Flower ID: ${profile.title}`,
    `Ссылка: ${link}`,
    order?.budget ? `Бюджет: ${order.budget}` : "",
    order?.occasion ? `Повод: ${order.occasion}` : "",
    order?.deliveryDate ? `Когда нужен букет: ${order.deliveryDate}` : "",
    order?.deliveryDetails ? `Доставка/самовывоз: ${order.deliveryDetails}` : "",
    order?.senderName ? `Заказчик: ${order.senderName}` : "",
    order?.senderContact ? `Контакт: ${order.senderContact}` : "",
    order?.comment ? `Комментарий: ${order.comment}` : "",
    requestId ? `Request ID: ${requestId}` : "",
    "",
    `Стиль: ${profile.description}`,
    `Подойдут цветы: ${listForOrder(profile.favorite_flowers) || "по Flower ID"}`,
    `Лучше избегать: ${listForOrder([...profile.avoid_flowers, ...profile.avoid_colors]) || "нет жёсткого стоп-листа"}`,
    "",
    "Помогите подобрать 3 варианта букета под этот стиль.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function listForOrder(items: string[]) {
  return items.filter(Boolean).filter(unique).slice(0, 6).join(", ");
}

async function openOrder(
  prefilledMessage: string,
  payload: { submissionId: string; requestId?: string | null; archetypeId: string; orderId?: string },
) {
  track("order_clicked", {
    orderId: payload.orderId,
    submissionId: payload.submissionId,
    requestId: payload.requestId,
    archetypeId: payload.archetypeId,
    channel: "telegram_account",
    telegramAccount: "@flowerid_order",
  });
  await navigator.clipboard?.writeText(prefilledMessage).catch(() => undefined);
  window.open(orderTelegramUrl, "_blank", "noopener,noreferrer");
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
