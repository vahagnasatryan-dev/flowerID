import {
  archetypeDescriptions,
  archetypeTitles,
  bouquetCards,
  flowerGroups,
  fragranceOptions,
  homeOptions,
  longevityOptions,
  moods,
  packagingOptions,
  packagingStopOptions,
  palettes,
  sizeOptions,
} from "./data";
import type { Answers, ArchetypeId, ComputedProfile, Reaction } from "./types";

type ScoreMap = Partial<Record<ArchetypeId, number>>;

const reactionWeight: Record<Reaction, number> = {
  hard_no: -2,
  dislike: -1,
  like: 1,
  love: 2,
};

const scoring: Record<string, ScoreMap> = {
  pastel_garden: { garden_romance: 3, paris_morning: 1, quiet_luxury: 1 },
  white_green: { white_green_minimalism: 3, quiet_luxury: 2 },
  bright_summer: { sunny_joy: 3, evening_wow: 1 },
  wine_drama: { dramatic_elegance: 3, evening_wow: 2 },
  peony_mono: { garden_romance: 2, classic_femininity: 2, paris_morning: 1 },
  field_natural: { wild_garden: 3, garden_romance: 1 },
  orchid_exotic: { art_experiment: 3, quiet_luxury: 1 },
  premium_laconic: { quiet_luxury: 3, white_green_minimalism: 2 },
  big_wow: { evening_wow: 3, dramatic_elegance: 1, sunny_joy: 1 },
  small_chamber: { paris_morning: 2, garden_romance: 1, quiet_luxury: 1 },
  designer_asymmetry: { art_experiment: 2, wild_garden: 2 },
  classic_round: { classic_femininity: 3, garden_romance: 1 },
  gentle: { garden_romance: 2, paris_morning: 1 },
  caring: { garden_romance: 2, classic_femininity: 1 },
  romantic: { garden_romance: 2, classic_femininity: 2 },
  quiet_expensive: { quiet_luxury: 3, white_green_minimalism: 1 },
  bright_joy: { sunny_joy: 3 },
  unusual: { art_experiment: 3 },
  elegant: { quiet_luxury: 2, dramatic_elegance: 1, paris_morning: 1 },
  wow: { evening_wow: 3, dramatic_elegance: 1 },
  cozy: { garden_romance: 1, wild_garden: 1 },
  airy: { paris_morning: 2, garden_romance: 2 },
  passionate: { dramatic_elegance: 3 },
  creative: { art_experiment: 3, wild_garden: 1 },
  wild_natural: { wild_garden: 3, garden_romance: 1 },
  minimal: { white_green_minimalism: 3, quiet_luxury: 1 },
  powder_cream: { garden_romance: 2, paris_morning: 1, quiet_luxury: 1 },
  white_green_palette: { white_green_minimalism: 3, quiet_luxury: 2 },
  peach_sun: { sunny_joy: 2, garden_romance: 1 },
  lavender: { paris_morning: 2, garden_romance: 1 },
  wine_berry: { dramatic_elegance: 3, evening_wow: 1 },
  bright_party: { sunny_joy: 3, evening_wow: 1 },
  earth_natural: { wild_garden: 3, quiet_luxury: 1 },
  graphic_contrast: { art_experiment: 2, dramatic_elegance: 2 },
  monochrome: { quiet_luxury: 2, classic_femininity: 1 },
  unusual_shades: { art_experiment: 3 },
  peony: { garden_romance: 3, classic_femininity: 1 },
  ranunculus: { garden_romance: 3, paris_morning: 1 },
  garden_rose: { garden_romance: 2, classic_femininity: 2 },
  hydrangea: { classic_femininity: 2, garden_romance: 1 },
  rose: { classic_femininity: 3 },
  tulip: { paris_morning: 3, classic_femininity: 1 },
  anemone: { paris_morning: 3, art_experiment: 1 },
  daisy: { wild_garden: 2, sunny_joy: 1 },
  delphinium: { wild_garden: 2 },
  astilbe: { wild_garden: 2, garden_romance: 1 },
  eucalyptus: { white_green_minimalism: 2, wild_garden: 1 },
  orchid: { art_experiment: 3, quiet_luxury: 1 },
  anthurium: { art_experiment: 3 },
  calla: { quiet_luxury: 2, art_experiment: 1 },
  freesia: { paris_morning: 2, garden_romance: 1 },
  field_flowers: { wild_garden: 3, sunny_joy: 1 },
  lilac: { paris_morning: 2, garden_romance: 2 },
  unknown_style: { quiet_luxury: 1 },
  protea: { art_experiment: 3, wild_garden: 1 },
  mini: { paris_morning: 1, quiet_luxury: 1 },
  medium: { garden_romance: 1, classic_femininity: 1 },
  large: { evening_wow: 2, dramatic_elegance: 1 },
  size_wow: { evening_wow: 3 },
};

export function computeProfile(answers: Answers): ComputedProfile {
  const scores = createScores();

  answers.bouquet_swipes.forEach(({ card_id, reaction }) => {
    add(scores, scoring[card_id], reactionWeight[reaction]);
  });

  answers.mood.forEach((id) => add(scores, scoring[id], 1.5));
  answers.favorite_palettes.forEach((id) => add(scores, paletteScore(id), 1.25));
  if (answers.ideal_palette) add(scores, paletteScore(answers.ideal_palette), 2);
  answers.rejected_palettes.forEach((id) => add(scores, paletteScore(id), -1));

  Object.entries(answers.flowers).forEach(([id, reaction]) => {
    const multiplier = reaction === "love" ? 2.5 : reaction === "dislike" || reaction === "forbidden" ? -1.5 : 0;
    add(scores, scoring[id], multiplier);
  });

  if (answers.size === "wow") add(scores, scoring.size_wow, 1);
  else add(scores, scoring[answers.size], 1);
  if (answers.wow_vs_practical >= 4) add(scores, { evening_wow: 2, dramatic_elegance: 1 }, 1);
  if (answers.wow_vs_practical <= 2) add(scores, { quiet_luxury: 1, white_green_minimalism: 1 }, 1);
  answers.associations.forEach((id) => add(scores, associationScore(id), 1));
  answers.packaging.forEach((id) => add(scores, packagingScore(id), 1));
  answers.packaging_stoplist.forEach((id) => add(scores, stopListScore(id), 1));

  const ranking = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({ id: id as ArchetypeId, value }));
  const primary = ranking[0]?.id ?? "garden_romance";
  const secondary = ranking[1] && ranking[1].value > 0 ? ranking[1].id : null;
  const hybrid = secondary && ranking[0].value > 0 && (ranking[0].value - ranking[1].value) / ranking[0].value < 0.15;
  const title = hybrid
    ? `${archetypeTitles[primary]} с оттенком «${archetypeTitles[secondary]}»`
    : archetypeTitles[primary];

  const favoritePalettes = collectPaletteColors(answers.favorite_palettes, answers.ideal_palette);
  const avoidColors = collectPaletteColors(answers.rejected_palettes).slice(0, 5);
  const favoriteFlowers = flowerLabelsByReaction(answers, "love");
  const avoidFlowers = [
    ...flowerLabelsByReaction(answers, "forbidden"),
    ...flowerLabelsByReaction(answers, "dislike"),
  ].filter(unique);
  const format = formatLabel(answers.size, answers.wow_vs_practical);
  const emotion = emotionLabels(answers);
  const florist_brief = buildFloristBrief(answers, {
    primary_archetype: primary,
    secondary_archetype: secondary,
    title,
    description: archetypeDescriptions[primary],
    preferred_colors: favoritePalettes,
    avoid_colors: avoidColors,
    favorite_flowers: favoriteFlowers,
    avoid_flowers: avoidFlowers,
    format,
    emotion,
    florist_brief: "",
    share_text: "",
  });

  const share_text = [
    `Мой цветочный стиль: ${title}`,
    `Мне нравятся: ${list([favoritePalettes.slice(0, 4).join(", "), favoriteFlowers.slice(0, 4).join(", ")])}.`,
    `Лучше избегать: ${list([...avoidFlowers.slice(0, 3), ...avoidColors.slice(0, 2)])}.`,
    `Идеальный формат: ${format}.`,
  ].join("\n");

  return {
    primary_archetype: primary,
    secondary_archetype: secondary,
    title,
    description: archetypeDescriptions[primary],
    preferred_colors: favoritePalettes,
    avoid_colors: avoidColors,
    favorite_flowers: favoriteFlowers,
    avoid_flowers: avoidFlowers,
    format,
    emotion,
    florist_brief,
    share_text,
  };
}

function createScores(): Record<ArchetypeId, number> {
  return Object.keys(archetypeTitles).reduce(
    (acc, id) => ({ ...acc, [id]: 0 }),
    {} as Record<ArchetypeId, number>,
  );
}

function add(scores: Record<ArchetypeId, number>, map: ScoreMap | undefined, multiplier: number) {
  if (!map || multiplier === 0) return;
  Object.entries(map).forEach(([id, value]) => {
    scores[id as ArchetypeId] += (value ?? 0) * multiplier;
  });
}

function paletteScore(id: string) {
  return scoring[id === "white_green" ? "white_green_palette" : id];
}

function associationScore(id: string): ScoreMap {
  if (["sad", "priroda", "leto", "vesna", "gory"].includes(id)) return { wild_garden: 2, garden_romance: 1 };
  if (["parizh", "utro", "knigi", "kofe"].includes(id)) return { paris_morning: 2 };
  if (["iskusstvo", "teatr", "gorod"].includes(id)) return { art_experiment: 1, dramatic_elegance: 1 };
  if (["minimalizm"].includes(id)) return { white_green_minimalism: 2, quiet_luxury: 1 };
  return {};
}

function packagingScore(id: string): ScoreMap {
  if (id === "minimal_wrap" || id === "ribbon") return { white_green_minimalism: 2, quiet_luxury: 1, paris_morning: 1 };
  if (id === "kraft") return { wild_garden: 2, garden_romance: 1 };
  if (id === "quiet_luxury_wrap" || id === "florist_choice") return { quiet_luxury: 2, white_green_minimalism: 1 };
  if (id === "romantic_wrap") return { garden_romance: 2, classic_femininity: 1 };
  return {};
}

function stopListScore(id: string): ScoreMap {
  if (id === "too_bright" || id === "too_colorful") {
    return { sunny_joy: -2, evening_wow: -1, art_experiment: -1, quiet_luxury: 1, white_green_minimalism: 1 };
  }
  if (id === "too_much_wrap" || id === "sparkles") return { quiet_luxury: 1, white_green_minimalism: 1, evening_wow: -1 };
  if (id === "strong_scent") return { paris_morning: 1, white_green_minimalism: 1, quiet_luxury: 1 };
  if (id === "lily") return { quiet_luxury: -1, dramatic_elegance: -1 };
  if (id === "too_large") return { evening_wow: -2, dramatic_elegance: -1, paris_morning: 1, white_green_minimalism: 1 };
  if (id === "too_simple") return { evening_wow: 1, dramatic_elegance: 1, art_experiment: 1, white_green_minimalism: -1 };
  if (id === "red_roses") return { dramatic_elegance: -1, classic_femininity: -1 };
  return {};
}

function collectPaletteColors(ids: string[], ideal?: string) {
  const ordered = [ideal, ...ids].filter(Boolean) as string[];
  return ordered
    .flatMap((id) => palettes.find((palette) => palette.id === id)?.description?.split(", ") ?? [])
    .filter(unique)
    .slice(0, 7);
}

function flowerLabelsByReaction(answers: Answers, reaction: "love" | "dislike" | "forbidden") {
  const fallbackLabels: Record<string, string> = {
    freesia: "Фрезии",
    field_flowers: "Полевые цветы",
    lilac: "Сирень",
    unknown_style: "Не знаю названия, важен общий стиль",
    dried_flowers: "Сухоцветы",
  };
  return Object.entries(answers.flowers)
    .filter(([id, value]) => value === reaction && id !== "none")
    .map(([id]) => flowerGroups.flatMap((group) => group.flowers).find((flower) => flower.id === id)?.label ?? fallbackLabels[id] ?? id);
}

function emotionLabels(answers: Answers) {
  const selected = answers.mood
    .map((id) => moods.find((mood) => mood.id === id)?.label.toLowerCase())
    .filter(Boolean) as string[];
  if (selected.length) return selected.slice(0, 3);
  return ["красота", "внимание", "тепло"];
}

function formatLabel(size: string, wow: number) {
  if (size === "depends") return "размер зависит от повода";
  const sizeLabel = sizeOptions.find((option) => option.id === size)?.label.toLowerCase() ?? "средний";
  if (wow >= 4) return `${sizeLabel} букет с заметным вау-эффектом`;
  if (wow <= 2) return `${sizeLabel} букет, удобный для дома`;
  return `${sizeLabel} сбалансированный букет`;
}

function buildFloristBrief(answers: Answers, profile: ComputedProfile) {
  const userName = answers.user.name || "Получатель";
  const packaging = labelList(answers.packaging, packagingOptions) || "доверяет флористу";
  const packagingStop = labelList(answers.packaging_stoplist, packagingStopOptions);
  const fragrance = fragranceOptions.find((option) => option.id === answers.fragrance)?.label.toLowerCase() || "не указано";
  const longevity = longevityOptions.find((option) => option.id === answers.longevity)?.label.toLowerCase() || "не указано";
  const home = labelList(answers.home_conditions, homeOptions);
  const warnings: string[] = [];

  if (answers.home_conditions.includes("cat") && answers.flowers.lily === "love") {
    warnings.push(
      "Пользователь любит лилии, но дома есть кошка. Лучше не использовать лилии и заменить их безопасной альтернативой с похожим эффектом.",
    );
  }

  if (answers.allergies.has_allergy) {
    warnings.push(`Есть ограничения по аллергии: ${answers.allergies.comment || "избегать пыльцы и резких ароматов"}.`);
  }

  return [
    `Получатель: ${userName}`,
    `Стиль: ${profile.title}.`,
    `Палитра: ${list(profile.preferred_colors) || "по выбранному архетипу"}.`,
    `Любит: ${list(profile.favorite_flowers) || "уточнить по визуальным предпочтениям"}.`,
    `Не использовать: ${list([...profile.avoid_flowers, ...profile.avoid_colors]) || "нет жесткого стоп-листа"}.`,
    `Аромат: ${fragrance}.`,
    `Стойкость: ${longevity}.`,
    `Условия: ${home || "особых условий нет"}.`,
    `Размер: ${profile.format}.`,
    `Эмоция: ${list(profile.emotion)}.`,
    `Упаковка: ${packaging}.`,
    packagingStop ? `Стоп-лист упаковки: ${packagingStop}.` : "",
    answers.personal_note ? `Комментарий: ${answers.personal_note}.` : "",
    warnings.length ? `Важно: ${warnings.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getPublicPayload(answers: Answers, profile: ComputedProfile) {
  return {
    name: answers.user.name,
    title: profile.title,
    description: profile.description,
    preferred_colors: profile.preferred_colors,
    favorite_flowers: profile.favorite_flowers,
    avoid_flowers: profile.avoid_flowers,
    preferred_format: profile.format,
  };
}

export function getBouquetHardNo(answers: Answers) {
  return answers.bouquet_swipes
    .filter((swipe) => swipe.reaction === "hard_no")
    .map((swipe) => bouquetCards.find((card) => card.id === swipe.card_id)?.title)
    .filter(Boolean) as string[];
}

function labelList(ids: string[], options: Array<{ id: string; label: string }>) {
  return list(ids.map((id) => options.find((option) => option.id === id)?.label ?? id));
}

function list(items: string[]) {
  return items.filter(Boolean).filter(unique).join(", ");
}

function unique<T>(value: T, index: number, array: T[]) {
  return array.indexOf(value) === index;
}
