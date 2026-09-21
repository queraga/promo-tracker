import type { Lob } from "./parsePromoSubject.types.js";

export const CANONICAL_PARTNERS = [
  "iSpace", "KTC", "Kibernetiki", "Comfy", "ALLO", "MOYO", "Vodafone", "Izhak",
  "Kyivstar", "Deira", "Sota Alliance", "Foxtrot", "Maifon", "Epicentr", "TTT",
  "Telemart", "DC Link", "Fopi", "Citrus", "Rozetka", "Eldorado", "NOVA LINIA",
  "Brain", "Dzvinok", "STLS", "Volti", "iDobrik", "Assol", "Mobiopt",
] as const;

export const PARTNER_ALIASES = {
  iSpace: ["ispace", "i space", "айспейс", "ай спейс"],
  KTC: ["ktc", "ктс", "к т с"],
  Kibernetiki: ["kibernetiki", "кібернетики", "кибернетики"],
  Comfy: ["comfy", "комфі", "комфи"],
  ALLO: ["allo", "алло", "allo.ua", "алло юа"],
  MOYO: ["moyo", "мойо"],
  Vodafone: ["vodafone", "водафон"],
  Izhak: ["izhak", "іжак", "ежак"],
  Kyivstar: ["kyivstar", "київстар", "киевстар"],
  Deira: ["deira", "дейра"],
  "Sota Alliance": ["sota alliance", "сота альянс"],
  Foxtrot: ["foxtrot", "фокстрот"],
  Maifon: ["maifon", "майфон"],
  Epicentr: ["epicentr", "epicenter", "епіцентр", "эпицентр", "епіцентр к", "эпицентр к"],
  TTT: ["ttt", "ттт", "т т т"],
  Telemart: ["telemart", "телемарт"],
  "DC Link": ["dc link", "dclink", "dc-link", "дс лінк", "дс линк"],
  Fopi: ["fopi", "фопі", "фопи"],
  Citrus: ["citrus", "цитрус", "citrus.ua", "цитрус юа"],
  Rozetka: ["rozetka", "розетка"],
  Eldorado: ["eldorado", "ельдорадо", "эльдорадо"],
  "NOVA LINIA": ["nova linia", "nova liniya", "нова лінія", "новая линия"],
  Brain: ["brain", "брейн", "брэйн", "brain.com.ua"],
  Dzvinok: ["dzvinok", "дзвінок", "дзвонок"],
  STLS: ["stls"],
  Volti: ["volti", "вольті", "вольти"],
  iDobrik: ["idobrik", "i dobrik", "добрик"],
  Assol: ["assol", "асоль", "ассоль"],
  Mobiopt: ["mobiopt", "mobi opt", "мобіопт", "мобиопт"],
  // Legacy partner retained for existing subjects and stored data.
  "ЖЖУК": ["жжук"],
} as const;

export type LobRule = {
  lob: Lob;
  keywords: readonly string[];
};

// First matching rule wins. Accessories intentionally take priority over devices.
export const LOB_RULES: readonly LobRule[] = [
  { lob: "Accessories", keywords: ["accessories"] },
  {
    lob: "ACCY",
    keywords: [
      "apple pencil",
      "silicone case",
      "clear case",
      "magic mouse",
      "magic keyboard",
      "pencil",
      "case",
    ],
  },
  { lob: "AW", keywords: ["apple watch", "watch se", "watch series"] },
  { lob: "AirPods", keywords: ["airpods"] },
  { lob: "Mac iPad", keywords: ["macbook", "mac mini", "imac", "ipad"] },
  { lob: "iPhone", keywords: ["iphone"] },
];
