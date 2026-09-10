import type { Lob } from "./parsePromoSubject.types.js";

export const PARTNER_ALIASES = {
  Rozetka: ["rozetka"],
  MOYO: ["moyo"],
  Foxtrot: ["foxtrot"],
  Eldorado: ["eldorado"],
  Comfy: ["comfy"],
  Citrus: ["citrus", "цитрус", "citrus.ua", "цитрус юа"],
  ALLO: ["allo", "алло", "allo.ua", "алло юа"],
  KTC: ["ktc", "ктс", "к т с"],
  iSpace: ["ispace", "i space", "айспейс", "ай спейс"],
  Kibernetiki: ["kibernetiki", "кібернетики", "кибернетики"],
  TTT: ["ttt", "ттт", "т т т"],
  Epicentr: ["epicentr", "epicenter", "епіцентр", "эпицентр", "епіцентр к", "эпицентр к"],
  Brain: ["brain", "брейн", "брэйн", "brain.com.ua"],
  "ЖЖУК": ["жжук"],
  Telemart: ["telemart"],
  Fopi: ["fopi"],
} as const;

export type LobRule = {
  lob: Lob;
  keywords: readonly string[];
};

// First matching rule wins. Accessories intentionally take priority over devices.
export const LOB_RULES: readonly LobRule[] = [
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
