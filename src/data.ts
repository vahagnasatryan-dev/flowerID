import type { ArchetypeId, BouquetCard, Option } from "./types";

export const totalSteps = 8;

export const archetypeTitles: Record<ArchetypeId, string> = {
  garden_romance: "Нежная садовая романтика",
  white_green_minimalism: "Бело-зеленый минимализм",
  dramatic_elegance: "Драматичная элегантность",
  sunny_joy: "Солнечная радость",
  wild_garden: "Дикий сад",
  art_experiment: "Арт-эксперимент",
  quiet_luxury: "Тихая роскошь",
  classic_femininity: "Классическая женственность",
  paris_morning: "Парижское утро",
  evening_wow: "Вечерний вау",
};

export const archetypeDescriptions: Record<ArchetypeId, string> = {
  garden_romance:
    "Вам ближе букеты, которые выглядят естественно, нежно и живо: мягкие оттенки, воздушная форма и ощущение заботы без лишнего пафоса.",
  white_green_minimalism:
    "Ваш идеальный букет чистый, свежий и собранный: белые оттенки, зелень, лаконичная форма и спокойная премиальность.",
  dramatic_elegance:
    "Вам подходят глубокие, выразительные букеты с характером: винные оттенки, крупные формы и вечерняя элегантность.",
  sunny_joy:
    "Ваш стиль наполнен цветом, светом и живой энергией: теплые оттенки, сезонные миксы и настроение праздника.",
  wild_garden:
    "Вам близка природная свобода: полевые фактуры, зелень, асимметрия и ощущение букета, собранного в красивом саду.",
  art_experiment:
    "Ваш букет может быть смелым объектом: необычные цветы, сложные оттенки, дизайнерская форма и творческий жест.",
  quiet_luxury:
    "Вы выбираете сдержанную красоту: спокойные премиальные оттенки, дорогие фактуры и минимум декоративного шума.",
  classic_femininity:
    "Ваш стиль про понятную гармонию: розы, гортензии, округлая форма и мягкая женственная красота.",
  paris_morning:
    "Вам подходит легкий, стильный и чуть небрежный букет: тюльпаны, анемоны, пастель и ощущение свежего утра.",
  evening_wow:
    "Вам нужен эффект момента: масштаб, насыщенные оттенки, выразительная форма и букет, который сразу замечают.",
};

export const bouquetCards: BouquetCard[] = [
  {
    id: "pastel_garden",
    title: "Нежный пастельный садовый",
    tags: ["садовый", "пастель", "нежный", "воздушный"],
    palette: ["пудровый", "кремовый", "светло-зеленый"],
    style: "garden",
    boldness: 2,
    form: "airy",
    gradient: "linear-gradient(145deg, #f5d6df, #fff4df 52%, #cfe6cf)",
    accent: "#d58aa3",
  },
  {
    id: "white_green",
    title: "Бело-зеленый минимализм",
    tags: ["белый", "зелень", "минимализм", "свежий"],
    palette: ["белый", "айвори", "шалфей"],
    style: "minimal",
    boldness: 1,
    form: "clean",
    gradient: "linear-gradient(145deg, #ffffff, #eaf3e8 54%, #93b69a)",
    accent: "#678f73",
  },
  {
    id: "bright_summer",
    title: "Яркий летний микс",
    tags: ["яркий", "летний", "радостный", "смелый"],
    palette: ["желтый", "оранжевый", "фуксия"],
    style: "bright",
    boldness: 4,
    form: "round",
    gradient: "linear-gradient(145deg, #ffe066, #ff8f6b 48%, #e6538f)",
    accent: "#e35a27",
  },
  {
    id: "wine_drama",
    title: "Глубокий винный драматичный",
    tags: ["драматичный", "винный", "вечерний", "элегантный"],
    palette: ["бордо", "сливовый", "темная вишня"],
    style: "dramatic",
    boldness: 5,
    form: "sculptural",
    gradient: "linear-gradient(145deg, #4e1229, #8c2f4d 50%, #d7b1bb)",
    accent: "#641a32",
  },
  {
    id: "peony_mono",
    title: "Монобукет из пионов",
    tags: ["пионы", "романтичный", "классика", "мягкий"],
    palette: ["розовый", "кремовый"],
    style: "classic",
    boldness: 2,
    form: "round",
    gradient: "linear-gradient(145deg, #f4b6c8, #ffe7ef 56%, #f9f2e8)",
    accent: "#c76f8c",
  },
  {
    id: "field_natural",
    title: "Полевой натуральный",
    tags: ["полевой", "натуральный", "сад", "асимметрия"],
    palette: ["ромашковый", "зелень", "небо"],
    style: "wild",
    boldness: 2,
    form: "free",
    gradient: "linear-gradient(145deg, #fff7b8, #d7ebbf 54%, #8bb7cf)",
    accent: "#7fa35e",
  },
  {
    id: "orchid_exotic",
    title: "Экзотика с орхидеями",
    tags: ["орхидеи", "экзотика", "арт", "необычный"],
    palette: ["фиолетовый", "лайм", "темный"],
    style: "art",
    boldness: 5,
    form: "graphic",
    gradient: "linear-gradient(145deg, #34214a, #8e5cc2 48%, #c9ee67)",
    accent: "#7b4ebb",
  },
  {
    id: "premium_laconic",
    title: "Премиальный лаконичный",
    tags: ["премиальный", "сдержанный", "айвори", "роскошь"],
    palette: ["айвори", "шампань", "шалфей"],
    style: "luxury",
    boldness: 2,
    form: "clean",
    gradient: "linear-gradient(145deg, #f6edd7, #d8d2bb 52%, #879d83)",
    accent: "#9f8d61",
  },
  {
    id: "big_wow",
    title: "Большой вау-букет",
    tags: ["вау", "большой", "праздничный", "масштаб"],
    palette: ["насыщенный", "розовый", "красный"],
    style: "wow",
    boldness: 5,
    form: "volume",
    gradient: "linear-gradient(145deg, #ffabc4, #d33f6a 48%, #7b1637)",
    accent: "#cf2557",
  },
  {
    id: "small_chamber",
    title: "Маленький камерный",
    tags: ["камерный", "нежный", "личный", "удобный"],
    palette: ["кремовый", "пудровый", "зелень"],
    style: "small",
    boldness: 1,
    form: "compact",
    gradient: "linear-gradient(145deg, #fff2dc, #e7c5ca 55%, #b7caa2)",
    accent: "#b98b7a",
  },
  {
    id: "designer_asymmetry",
    title: "Асимметричный дизайнерский",
    tags: ["дизайнерский", "асимметрия", "творческий", "необычный"],
    palette: ["сложный", "контраст", "зелень"],
    style: "designer",
    boldness: 4,
    form: "asymmetric",
    gradient: "linear-gradient(145deg, #eff0cf, #6c9a78 48%, #323a52)",
    accent: "#546f59",
  },
  {
    id: "classic_round",
    title: "Классический круглый",
    tags: ["классика", "округлый", "гармоничный", "понятный"],
    palette: ["розовый", "кремовый", "зелень"],
    style: "classic",
    boldness: 2,
    form: "round",
    gradient: "linear-gradient(145deg, #fac9d1, #f8ead4 54%, #9fbf92)",
    accent: "#d18b93",
  },
];

export const moods: Option[] = [
  { id: "airy", label: "Нежный и воздушный" },
  { id: "elegant", label: "Элегантный и сдержанный" },
  { id: "bright_joy", label: "Яркий и радостный" },
  { id: "romantic", label: "Романтичный" },
  { id: "wild_natural", label: "Природный и живой" },
  { id: "creative", label: "Необычный и артистичный" },
  { id: "quiet_expensive", label: "Премиальный и дорогой" },
  { id: "minimal", label: "Минималистичный" },
];

export const palettes: Option[] = [
  { id: "powder_cream", label: "Пудра и крем", description: "пыльная роза, молочный, шампань, светлая зелень", colors: ["#e8b9c5", "#fff1dd", "#ead9a7", "#cfe4bd"] },
  { id: "white_green", label: "Бело-зеленая чистота", description: "белый, айвори, шалфей, эвкалипт", colors: ["#ffffff", "#f4ecd7", "#aebf9b", "#6c957d"] },
  { id: "peach_sun", label: "Персик и солнце", description: "персиковый, абрикосовый, теплый розовый, ванильный", colors: ["#ffc19a", "#f4a35d", "#ee9aac", "#ffe5a7"] },
  { id: "lavender", label: "Сирень и лаванда", description: "лиловый, сиреневый, холодный розовый, серо-зеленый", colors: ["#c7a7dd", "#b896d2", "#e3adc4", "#9fb7aa"] },
  { id: "wine_berry", label: "Вино и ягоды", description: "бордо, сливовый, темная вишня, пудровый", colors: ["#7a1531", "#63305f", "#4d0b1d", "#ddb7c2"] },
  { id: "bright_party", label: "Яркий праздник", description: "желтый, оранжевый, фуксия, коралл", colors: ["#ffd43b", "#ff8a3d", "#d9368b", "#ff6f61"] },
  { id: "earth_natural", label: "Земля и натуральность", description: "терракота, бежевый, оливковый, песочный", colors: ["#b76745", "#d8b98f", "#758a4c", "#e2c991"] },
  { id: "graphic_contrast", label: "Графичный контраст", description: "белый, темный, красный акцент, насыщенная зелень", colors: ["#ffffff", "#25252a", "#b7192b", "#176b4d"] },
  { id: "monochrome", label: "Монохром", description: "один цвет в разных оттенках", colors: ["#f7d4dd", "#e9aabc", "#ca7695", "#985472"] },
  { id: "unusual_shades", label: "Необычные оттенки", description: "синий, фиолетовый, лайм, сложные контрасты", colors: ["#4b79d8", "#7443a8", "#c7e84b", "#252833"] },
];

export const flowerGroups: Array<{ title: string; flowers: Option[] }> = [
  { title: "Классика", flowers: ["Розы", "Пионовидные розы", "Тюльпаны", "Гортензии", "Хризантемы"].map((label) => ({ id: slug(label), label })) },
  { title: "Нежные садовые", flowers: ["Пионы", "Ранункулюсы", "Анемоны", "Душистый горошек", "Маттиола"].map((label) => ({ id: slug(label), label })) },
  { title: "Премиальные и необычные", flowers: ["Орхидеи", "Антуриумы", "Каллы", "Протея", "Амариллис"].map((label) => ({ id: slug(label), label })) },
  { title: "Натуральные", flowers: ["Ромашки", "Дельфиниум", "Астильба", "Скабиоза", "Эвкалипт"].map((label) => ({ id: slug(label), label })) },
  { title: "Спорные", flowers: ["Лилии", "Гвоздики", "Герберы", "Альстромерии", "Гипсофила"].map((label) => ({ id: slug(label), label })) },
];

export const sizeOptions: Option[] = [
  { id: "mini", label: "Мини", description: "маленький личный знак внимания" },
  { id: "medium", label: "Средний", description: "красивый, удобный, для дома" },
  { id: "large", label: "Большой", description: "заметный и праздничный" },
  { id: "wow", label: "Вау", description: "хочется ахнуть" },
];

export const fragranceOptions: Option[] = [
  { id: "aromatic", label: "Люблю ароматные цветы" },
  { id: "light", label: "Лучше легкий аромат" },
  { id: "none", label: "Без запаха" },
  { id: "sensitive", label: "Сильные запахи раздражают" },
];

export const longevityOptions: Option[] = [
  { id: "long", label: "Хочу, чтобы стоял как можно дольше" },
  { id: "beauty", label: "Главное - красота, даже если недолго" },
  { id: "balance", label: "Баланс красоты и стойкости" },
];

export const homeOptions: Option[] = [
  { id: "cat", label: "Кошка" },
  { id: "dog", label: "Собака" },
  { id: "kids", label: "Маленькие дети" },
  { id: "none", label: "Нет" },
];

export const allergyOptions: Option[] = [
  { id: "none", label: "Нет" },
  { id: "pollen", label: "Есть, лучше без пыльцы" },
  { id: "fragrance", label: "Есть, лучше без резких ароматов" },
  { id: "custom", label: "Укажу отдельно" },
];

export const packagingOptions: Option[] = [
  { id: "minimal_wrap", label: "Минималистичная упаковка" },
  { id: "kraft", label: "Натуральная / крафт" },
  { id: "quiet_luxury_wrap", label: "Премиальная и сдержанная" },
  { id: "romantic_wrap", label: "Романтичная" },
  { id: "ribbon", label: "Без лишней упаковки" },
  { id: "florist_choice", label: "Флорист может выбрать сам" },
];

export const packagingStopOptions: Option[] = [
  { id: "too_bright", label: "Кричащие цвета" },
  { id: "too_colorful", label: "Пёстрая гамма" },
  { id: "red_roses", label: "Красные розы" },
  { id: "too_much_wrap", label: "Много упаковки" },
  { id: "sparkles", label: "Блёстки, стразы, декор" },
  { id: "strong_scent", label: "Сильный аромат" },
  { id: "lily", label: "Лилии" },
  { id: "too_large", label: "Крупный формат" },
  { id: "too_simple", label: "Простая композиция" },
  { id: "no_hard_bans", label: "Нет жёстких запретов" },
];

export const associationOptions: Option[] = [
  "Море",
  "Горы",
  "Сад",
  "Утро",
  "Закат",
  "Париж",
  "Италия",
  "Армения",
  "Лето",
  "Весна",
  "Детство",
  "Искусство",
  "Театр",
  "Минимализм",
  "Винтаж",
  "Путешествия",
  "Природа",
  "Город",
  "Кофе",
  "Книги",
].map((label) => ({ id: slug(label), label }));

export function slug(label: string) {
  const map: Record<string, string> = {
    Розы: "rose",
    "Пионовидные розы": "garden_rose",
    Тюльпаны: "tulip",
    Гортензии: "hydrangea",
    Хризантемы: "chrysanthemum",
    Пионы: "peony",
    Ранункулюсы: "ranunculus",
    Анемоны: "anemone",
    "Душистый горошек": "sweet_pea",
    Маттиола: "matthiola",
    Орхидеи: "orchid",
    Антуриумы: "anthurium",
    Каллы: "calla",
    Протея: "protea",
    Амариллис: "amaryllis",
    Ромашки: "daisy",
    Дельфиниум: "delphinium",
    Астильба: "astilbe",
    Скабиоза: "scabiosa",
    Эвкалипт: "eucalyptus",
    Лилии: "lily",
    Гвоздики: "carnation",
    Герберы: "gerbera",
    Альстромерии: "alstroemeria",
    Гипсофила: "gypsophila",
    Море: "more",
    Горы: "gory",
    Сад: "sad",
    Утро: "utro",
    Закат: "zakat",
    Париж: "parizh",
    Италия: "italia",
    Армения: "armenia",
    Лето: "leto",
    Весна: "vesna",
    Детство: "detstvo",
    Искусство: "iskusstvo",
    Театр: "teatr",
    Минимализм: "minimalizm",
    Винтаж: "vintage",
    Путешествия: "travel",
    Природа: "priroda",
    Город: "gorod",
    Кофе: "kofe",
    Книги: "knigi",
    Блестки: "glitter",
    Банты: "bows",
    Сетка: "mesh",
    "Яркая упаковка": "bright_packaging",
    "Слишком много декора": "too_much_decor",
    "Шаблонные открытки": "template_cards",
    "Искусственные элементы": "artificial_elements",
  };
  return (
    map[label] ||
    label
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-zа-я0-9_]/gi, "")
  );
}
