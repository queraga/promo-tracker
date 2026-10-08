import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { toPromoDto, type PromoRecord } from "../src/api/dto.js";
import { createPromoOperationFromParsedSubject } from "../src/features/createPromo/createPromoFromParsedSubject.js";
import { ClosedReportingPeriodError } from "../src/features/quarterlyReporting/closedPeriods.js";
import { classifyCreditPromo, deriveSpecialPromoMetadata, type SpecialPromoMetadata } from "../src/features/creditPromo/creditPromo.js";
import { parsePromoSubject } from "../src/features/parsePromoSubject/parsePromoSubject.js";
import { prisma } from "../src/shared/db/prisma.js";
import { PendingPromoStore } from "../src/bot/state/pendingPromoStore.js";
import { handlePromoCallback } from "../src/bot/workflows/promoCallbackWorkflow.js";

const now = new Date("2026-09-09T10:00:00.000Z");
const parse = (input: string) => parsePromoSubject(input, now);
const allLobFoxtrot = "ПЧ10 mono Apple all LOB 01.10-30.10 - Foxtrot";

beforeEach(async () => {
  await prisma.reportingPeriod.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

describe("M13 credit classification and parsing", () => {
  it.each(["ОЧ25", "ОЧ 25", "och25", "OCH 25", "ОЧ10", "OCH30"])("recognizes Privat mechanic %s", (marker) => {
    expect(classifyCreditPromo(marker)).toEqual({ kind: "credit", metadata: { bank: "PRIVATBANK", mechanic: `ОЧ${marker.match(/\d+/)?.[0]}` } });
  });

  it.each(["ПЧ10", "ПЧ 10", "pch10", "PCH 10", "ПЧ25", "pCh30"])("recognizes mono mechanic %s", (marker) => {
    expect(classifyCreditPromo(marker)).toEqual({ kind: "credit", metadata: { bank: "MONO", mechanic: `ПЧ${marker.match(/\d+/)?.[0]}` } });
  });

  it.each(["mono", "моно", "monobank", "монобанк", "mono bank", "моно банк", "monomarket", "мономаркет", "mono market", "моно маркет", "MONO", "МОНОБАНК"])("recognizes mono brand %s without an installment marker", (brand) => {
    expect(classifyCreditPromo(`Promo ${brand} iPhone`)).toEqual({ kind: "credit", metadata: { bank: "MONO", mechanic: null } });
  });

  it.each(["monolithic", "monopoly", "monogram", "myMonobank", "OCH25x", "prefixPCH10", "Приват"])("does not classify unsafe substring or generic text %s", (value) => {
    expect(classifyCreditPromo(value)).toBeNull();
  });

  it.each([
    "FSM ПЧ10 mono iPhone 01.10-30.10 - Comfy",
    "ОЧ25 ПЧ10 mono iPhone 01.10-30.10 - Comfy",
    "ОЧ15 ОЧ25 iPhone 01.10-30.10 - Comfy",
  ])("rejects conflicting classification: %s", (input) => {
    expect(parse(input)).toMatchObject({ isValid: false, classificationConflict: expect.any(String) });
    expect(parse(input).warnings.join(" ")).toMatch(/несумісні|однозначно визначити/u);
  });

  it("parses the Privat example and preserves useful credit wording", () => {
    const result = parse("Re: ОЧ25 Приват Нова лінійка AirPods & Apple Watch 28.09-04.10 - Rozetka");
    expect(result).toMatchObject({ credit: { bank: "PRIVATBANK", mechanic: "ОЧ25" }, lob: "AW & AirPods", partner: "Rozetka", startDate: "2026-09-28", endDate: "2026-10-04", isValid: true });
    expect(result.promoName).toContain("ОЧ25 Приват Нова лінійка");
    expect(result.promoName).toContain("AirPods & Apple Watch");
  });

  it("recognizes all-LOB only for credit and preserves structured credit fields", () => {
    const credit = parse(allLobFoxtrot);
    expect(credit).toMatchObject({ allLob: true, lob: null, credit: { bank: "MONO", mechanic: "ПЧ10" }, partner: "Foxtrot", startDate: "2026-10-01", endDate: "2026-10-30", isValid: true });
    expect(credit.warnings).toEqual([]);
    expect(credit.promoName).toBe("ПЧ10 mono Apple all LOB");
    expect(parse("iPhone all LOB 01.10-30.10 - Foxtrot")).toMatchObject({ allLob: false, lob: "iPhone" });
    const structured = parse("ПЧ10 mono Apple promo\nLOB: all LOB\nPartner: Foxtrot\nPeriod: 01.10-30.10");
    expect(structured).toMatchObject({ allLob: true, isValid: true });
    expect(structured.promoName).toContain("ПЧ10 mono Apple promo");
    expect(structured.promoName).not.toContain("LOB:");
  });

  it("does not expand standard all-LOB wording", async () => {
    const result = await createPromoOperationFromParsedSubject(parse("iPhone all LOB 01.10-30.10 - Foxtrot"));
    expect(result).toMatchObject({ allLob: false, credit: null });
    expect(result.promos).toHaveLength(1);
    expect(await prisma.promo.count()).toBe(1);
  });

  it("requires a LOB unless a valid credit all-LOB intent is present", () => {
    expect(parse("ПЧ10 mono Apple 01.10-30.10 - Foxtrot")).toMatchObject({ credit: { bank: "MONO" }, lob: null, allLob: false, isValid: false });
    expect(parse("ПЧ10 mono Apple 01.10-30.10")).toMatchObject({ partner: null, isValid: false });
  });

  it("keeps existing composite and explicit LOB parsing", () => {
    expect(parse("ОЧ25 Приват AirPods & Apple Watch 01.10-30.10 - Foxtrot").lob).toBe("AW & AirPods");
    expect(parse("ПЧ10 mono Mac + iPad 01.10-30.10 - Foxtrot").lob).toBe("Mac iPad");
    expect(parse("ПЧ10 mono Accessories 01.10-30.10 - Foxtrot").lob).toBe("ACCY");
  });

  it.each([
    ["ПЧ15 mono iPhone launch\n- ПЧ15 mono\n- Partners: Rozetka, Kibernetiki\n- 01.10-31.12", ["Rozetka", "Kibernetiki"]],
    ["ОЧ15 Приват iPhone launch\n- ОЧ15 ПриватБанк\n- Partners: Rozetka; Kibernetiki; iSpace\n- 01.10-31.12", ["Rozetka", "Kibernetiki", "iSpace"]],
    ["ОЧ15 Приват iPhone launch\n- ОЧ15 ПриватБанк\n- rozetka KIBERNETIKI i SPACE\n- 01.10-31.12", ["Rozetka", "Kibernetiki", "iSpace"]],
    ["ПЧ10 mono iPhone launch\n- ПЧ10 mono\n- Rozetka Rozetka iSpace\n- 01.10-31.12", ["Rozetka", "iSpace"]],
  ])("parses complete multi-partner CREDIT lists", (subject, partners) => {
    const parsed = parse(subject);
    expect(parsed).toMatchObject({ credit: expect.any(Object), selectedPartners: partners, partner: partners[0], isValid: true, warnings: [] });
    expect(parsed.promoName).not.toMatch(/Partners:|Kibernetiki|Rozetka|iSpace/u);
  });

  it("keeps campaign partner-like words while removing only a designated list line", () => {
    const parsed = parse("ПЧ10 mono Rozetka campaign iPhone\n- ПЧ10 mono\n- Partners: Rozetka, iSpace\n- 01.10-31.12");
    expect(parsed.promoName).toContain("Rozetka campaign");
    expect(parsed.promoName).not.toContain("Partners:");
  });

  it("resolves multi-word partner aliases as exact list entries", () => {
    const parsed = parse("ОЧ15 Приват iPhone initiative\n- ОЧ15 ПриватБанк\n- Partners: Sota Alliance; DC Link\n- 01.10-31.12");
    expect(parsed).toMatchObject({ selectedPartners: ["Sota Alliance", "DC Link"], isValid: true });
  });

  it.each([
    "ОЧ15 Приват iPhone launch\n- ОЧ15 ПриватБанк\n- Partners: Rozetka, UnknownPartner, iSpace\n- 01.10-31.12",
    "ОЧ15 Приват iPhone launch\n- ОЧ15 ПриватБанк\n- Rozetka Kibernetiki UnknownPartner\n- 01.10-31.12",
    "ОЧ15 Приват iPhone launch\n- ОЧ15 ПриватБанк\n- Rozetka Rozetka\n- 01.10-31.12",
  ])("rejects incomplete or too-short designated partner lists without partial persistence: %s", (subject) => {
    const parsed = parse(subject);
    expect(parsed.isValid).toBe(false);
    expect(parsed.partnerListError).toBeTruthy();
  });

  it("does not interpret partner-like words in a campaign title as a list", () => {
    const parsed = parse("ОЧ15 Приват Rozetka iSpace campaign iPhone 01.10-31.12 - Foxtrot");
    expect(parsed.selectedPartners).toBeUndefined();
    expect(parsed.partner).toBe("Foxtrot");
    expect(parsed.isValid).toBe(true);
  });

  it("preserves the legacy single-partner CREDIT path", () => {
    expect(parse("ПЧ10 mono iPhone launch 01.10-31.12 - Foxtrot")).toMatchObject({
      partner: "Foxtrot", promoName: "ПЧ10 mono iPhone launch", isValid: true,
    });
    expect(parse("ОЧ15 Приват iPhone launch\n- ОЧ15 ПриватБанк\n- Rozetka\n- 01.10-31.12")).toMatchObject({
      partner: "Rozetka", isValid: true,
    });
  });

  it("canonicalizes equivalent Latin and Cyrillic mechanic spellings in normalizedName", () => {
    expect(parse("OCH25 Приват iPhone 01.10-30.10 - Comfy").normalizedName).toBe(parse("ОЧ25 Приват iPhone 01.10-30.10 - Comfy").normalizedName);
    expect(parse("PCH10 mono iPhone 01.10-30.10 - Comfy").normalizedName).toBe(parse("ПЧ10 mono iPhone 01.10-30.10 - Comfy").normalizedName);
    expect(parse("ОЧ15 Privat iPhone 01.10-30.10 - Comfy").normalizedName).not.toBe(parse("ОЧ25 Privat iPhone 01.10-30.10 - Comfy").normalizedName);
    expect(parse("ПЧ10 mono iPhone 01.10-30.10 - Comfy").normalizedName).not.toBe(parse("ПЧ15 mono iPhone 01.10-30.10 - Comfy").normalizedName);
  });
});

describe("M13 credit batch persistence", () => {
  it("creates exactly the six atomic LOB promos and preserves the same source", async () => {
    const parsed = parse(allLobFoxtrot);
    const result = await createPromoOperationFromParsedSubject(parsed);
    expect(result.promos.map(({ promo }) => promo.lob)).toEqual(["iPhone", "Mac", "iPad", "AW", "AirPods", "ACCY"]);
    expect(result.promos.every(({ promo }) => promo.name === "ПЧ10 mono Apple all LOB")).toBe(true);
    expect(result.promos.every(({ promoPartner }) => promoPartner.rawEmailSubject === parsed.rawSubject)).toBe(true);
    expect(await prisma.promo.count()).toBe(6);
    expect(await prisma.promoPartner.count()).toBe(6);
    expect((await prisma.partner.findMany()).map(({ name }) => name)).toEqual(["Foxtrot"]);
    expect((await prisma.promo.findMany()).map(({ lob }) => lob).sort()).not.toContain("Mac iPad");
    expect((await prisma.promo.findMany()).map(({ lob }) => lob).sort()).not.toContain("AW & AirPods");
  });

  it("is idempotent for the same partner and joins an equivalent second partner", async () => {
    await createPromoOperationFromParsedSubject(parse(allLobFoxtrot));
    await createPromoOperationFromParsedSubject(parse(allLobFoxtrot));
    const secondPartner = await createPromoOperationFromParsedSubject(parse("ПЧ10 mono Apple all LOB 01.10-30.10 - Comfy"));
    expect(secondPartner.promos.every(({ createdPromo }) => !createdPromo)).toBe(true);
    expect(secondPartner.promos.every(({ createdPromoPartner }) => createdPromoPartner)).toBe(true);
    expect(await prisma.promo.count()).toBe(6);
    expect(await prisma.promoPartner.count()).toBe(12);
    expect(await prisma.promoPartner.count({ where: { partner: { name: "Foxtrot" } } })).toBe(6);
    expect(await prisma.promoPartner.count({ where: { partner: { name: "Comfy" } } })).toBe(6);
  });

  it("reuses a partially existing six-LOB set", async () => {
    const first = await createPromoOperationFromParsedSubject(parse(allLobFoxtrot));
    await prisma.promo.deleteMany({ where: { id: { in: first.promos.slice(3).map(({ promo }) => promo.id) } } });
    expect(await prisma.promo.count()).toBe(3);
    const result = await createPromoOperationFromParsedSubject(parse(allLobFoxtrot));
    expect(result.promos.filter(({ createdPromo }) => createdPromo)).toHaveLength(3);
    expect(await prisma.promo.count()).toBe(6);
    expect(await prisma.promoPartner.count()).toBe(6);
  });

  it("rolls back all writes when a mid-batch persistence step fails", async () => {
    const failFourthRelation = async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(async (tx) => {
      let calls = 0;
      const transaction = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== "promoPartner") return Reflect.get(target, property, receiver);
          const delegate = Reflect.get(target, property, receiver) as object;
          return new Proxy(delegate, {
            get(inner, method, innerReceiver) {
              if (method !== "upsert") return Reflect.get(inner, method, innerReceiver);
              return async (...args: Parameters<typeof tx.promoPartner.upsert>) => {
                calls += 1;
                if (calls === 4) throw new Error("forced batch failure");
                const upsert = Reflect.get(inner, method, innerReceiver) as (...values: Parameters<typeof tx.promoPartner.upsert>) => ReturnType<typeof tx.promoPartner.upsert>;
                return upsert.apply(inner, args);
              };
            },
          });
        },
      }) as Prisma.TransactionClient;
      return work(transaction);
    });
    await expect(createPromoOperationFromParsedSubject(parse(allLobFoxtrot), failFourthRelation)).rejects.toThrow("forced batch failure");
    expect(await prisma.promo.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
  });

  it("rejects the complete batch if one target LOB period is CLOSED", async () => {
    await prisma.reportingPeriod.create({ data: { year: 2026, quarter: 4, lob: "AW", status: "CLOSED" } });
    await expect(createPromoOperationFromParsedSubject(parse(allLobFoxtrot))).rejects.toBeInstanceOf(ClosedReportingPeriodError);
    expect(await prisma.promo.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
  });

  it("deduplicates equivalent scripts and keeps different terms and banks distinct", async () => {
    await createPromoOperationFromParsedSubject(parse("OCH25 Приват iPhone 01.10-30.10 - Comfy"));
    await createPromoOperationFromParsedSubject(parse("ОЧ25 Приват iPhone 01.10-30.10 - Comfy"));
    await createPromoOperationFromParsedSubject(parse("ОЧ15 Приват iPhone 01.10-30.10 - Comfy"));
    await createPromoOperationFromParsedSubject(parse("ОЧ10 Приват iPhone 01.10-30.10 - Comfy"));
    await createPromoOperationFromParsedSubject(parse("PCH10 mono iPhone 01.10-30.10 - Comfy"));
    await createPromoOperationFromParsedSubject(parse("ПЧ10 mono iPhone 01.10-30.10 - Comfy"));
    await createPromoOperationFromParsedSubject(parse("ПЧ15 mono iPhone 01.10-30.10 - Comfy"));
    expect(await prisma.promo.count()).toBe(5);
    expect(await prisma.promoPartner.count()).toBe(5);
  });

  it("keeps concurrent equivalent batch submissions unique and complete", async () => {
    const results = await Promise.allSettled([
      createPromoOperationFromParsedSubject(parse(allLobFoxtrot)),
      createPromoOperationFromParsedSubject(parse(allLobFoxtrot)),
    ]);
    expect(results.some(({ status }) => status === "fulfilled")).toBe(true);
    expect(await prisma.promo.count()).toBe(6);
    expect(await prisma.promoPartner.count()).toBe(6);
    expect(await prisma.promo.count({ where: { lob: { in: ["Mac iPad", "AW & AirPods"] } } })).toBe(0);
  });

  it("creates one shared Promo and three partner relations for a single-LOB list", async () => {
    const parsed = parse("ОЧ15 Приват iPhone initiative\n- ОЧ15 ПриватБанк\n- Partners: Rozetka, Kibernetiki, iSpace\n- 01.10-31.12");
    const result = await createPromoOperationFromParsedSubject(parsed);
    expect(result.promos).toHaveLength(3);
    expect(new Set(result.promos.map(({ promo }) => promo.id)).size).toBe(1);
    expect(result.promos.map(({ partner }) => partner.name)).toEqual(["Rozetka", "Kibernetiki", "iSpace"]);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(3);
    expect(new Set(result.promos.map(({ promo }) => promo.normalizedName)).size).toBe(1);
  });

  it("creates six shared LOB promos and exactly eighteen relations for three partners", async () => {
    const parsed = parse("ПЧ10 mono Apple all LOB\n- ПЧ10 mono\n- Partners: Rozetka, Kibernetiki, iSpace\n- 01.10-31.10");
    const result = await createPromoOperationFromParsedSubject(parsed);
    expect(result.promos).toHaveLength(18);
    expect(new Set(result.promos.map(({ promo }) => promo.id)).size).toBe(6);
    expect(new Set(result.promos.map(({ partner }) => partner.name))).toEqual(new Set(["Rozetka", "Kibernetiki", "iSpace"]));
    expect(await prisma.promo.count()).toBe(6);
    expect(await prisma.promoPartner.count()).toBe(18);
    expect(new Set(result.promos.map(({ promo }) => promo.lob))).toEqual(new Set(["iPhone", "Mac", "iPad", "AW", "AirPods", "ACCY"]));
    expect(new Set(result.promos.map(({ promo }) => promo.normalizedName)).size).toBe(1);
  });

  it("rolls back a multi-partner batch when a later relation write fails", async () => {
    const parsed = parse("ПЧ10 mono iPhone initiative\n- ПЧ10 mono\n- Partners: Rozetka, Kibernetiki, iSpace\n- 01.10-31.12");
    const failSecondRelation = async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(async (tx) => {
      let writes = 0;
      const transaction = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== "promoPartner") return Reflect.get(target, property, receiver);
          const delegate = Reflect.get(target, property, receiver) as object;
          return new Proxy(delegate, {
            get(inner, method, innerReceiver) {
              if (method !== "upsert") return Reflect.get(inner, method, innerReceiver);
              return async (...args: Parameters<typeof tx.promoPartner.upsert>) => {
                writes += 1;
                if (writes === 2) throw new Error("forced multi-partner relation failure");
                const upsert = Reflect.get(inner, method, innerReceiver) as (...values: Parameters<typeof tx.promoPartner.upsert>) => ReturnType<typeof tx.promoPartner.upsert>;
                return upsert.apply(inner, args);
              };
            },
          });
        },
      }) as Prisma.TransactionClient;
      return work(transaction);
    });
    await expect(createPromoOperationFromParsedSubject(parsed, failSecondRelation)).rejects.toThrow("forced multi-partner relation failure");
    expect(await prisma.promo.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
  });

  it("is idempotent for repeated multi-partner submissions and permits adding one later", async () => {
    const multi = parse("ОЧ15 Приват iPhone initiative\n- ОЧ15 ПриватБанк\n- Partners: Rozetka, Kibernetiki\n- 01.10-31.12");
    const first = await createPromoOperationFromParsedSubject(multi);
    const repeat = await createPromoOperationFromParsedSubject(multi);
    const laterPartner = await createPromoOperationFromParsedSubject(parse("ОЧ15 Приват iPhone initiative\n- ОЧ15 ПриватБанк\n- Partners: iSpace\n- 01.10-31.12"));
    expect(first.promos.every(({ createdPromoPartner }) => createdPromoPartner)).toBe(true);
    expect(repeat.promos.every(({ createdPromoPartner }) => !createdPromoPartner)).toBe(true);
    expect(laterPartner.promos[0]?.createdPromo).toBe(false);
    expect(laterPartner.promos[0]?.createdPromoPartner).toBe(true);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(3);
  });

  it("keeps same-name credit promos isolated by partner while sharing the campaign identity", async () => {
    const rozetka = await createPromoOperationFromParsedSubject(parse("ПЧ10 mono iPhone initiative 01.10-31.10 - Rozetka"));
    const comfy = await createPromoOperationFromParsedSubject(parse("ПЧ10 mono iPhone initiative 01.10-31.10 - Comfy"));
    expect(comfy.promos[0]?.createdPromo).toBe(false);
    expect(comfy.promos[0]?.createdPromoPartner).toBe(true);
    expect(comfy.promos[0]?.promo.id).toBe(rozetka.promos[0]?.promo.id);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(2);
  });

  it("keeps concurrent Telegram Add callbacks for a multi-partner credit promo idempotent", async () => {
    const parsed = parse("ПЧ10 mono iPhone initiative\n- ПЧ10 mono\n- Partners: Rozetka, Kibernetiki, iSpace\n- 01.10-31.12");
    const store = new PendingPromoStore(60_000, () => 0, () => "multi-confirmation");
    const id = store.createPendingPromo(parsed, { chatId: 1, userId: 2 });
    const persist = (value: typeof parsed) => createPromoOperationFromParsedSubject(value);
    const results = await Promise.all([
      handlePromoCallback("add", id, { chatId: 1, userId: 2 }, store, persist),
      handlePromoCallback("add", id, { chatId: 1, userId: 2 }, store, persist),
    ]);
    expect(results).toHaveLength(2);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(3);
  });
});

describe("central special Promo metadata", () => {
  it.each([
    ["FSM iPhone", { kind: "FSM" }],
    ["ПЧ10 mono iPhone Promo", { kind: "CREDIT", bank: "MONO", mechanic: "ПЧ10" }],
    ["monomarket iPhone Promo", { kind: "CREDIT", bank: "MONO", mechanic: null }],
    ["OCH25 Приват Promo", { kind: "CREDIT", bank: "PRIVATBANK", mechanic: "ОЧ25" }],
    ["monolithic Promo", null],
    ["Ordinary iPhone Promo", null],
  ])("derives DTO metadata for %s", (name, expected) => {
    expect(deriveSpecialPromoMetadata(name)).toEqual(expected as SpecialPromoMetadata | null);
  });

  it("adds specialPromo metadata to API DTO without exposing normalizedName", () => {
    const createdAt = now;
    const promo = { id: "dto", lob: "AW", name: "ПЧ10 mono AirPods", normalizedName: "pch10 mono airpods", startDate: now, endDate: now, prolongedAt: now, createdAt, updatedAt: now };
    const record = { ...promo, partners: [] } as PromoRecord;
    const dto = toPromoDto(record, now);
    expect(dto).toMatchObject({ specialPromo: { kind: "CREDIT", bank: "MONO", mechanic: "ПЧ10" }, prolongedAt: now.toISOString() });
    expect(dto).not.toHaveProperty("normalizedName");
  });
});
