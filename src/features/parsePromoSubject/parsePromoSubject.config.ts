import type { Lob } from "./parsePromoSubject.types.js";

export const PARTNERS = [
  "Rozetka",
  "MOYO",
  "Foxtrot",
  "Eldorado",
  "Comfy",
  "Цитрус",
  "Алло",
  "ЖЖУК",
  "Telemart",
  "Fopi",
] as const;

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
