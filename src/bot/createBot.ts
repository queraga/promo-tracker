import { Bot, InlineKeyboard } from "grammy";
import { createPromoFromParsedSubject } from "../features/createPromo/createPromoFromParsedSubject.js";
import { getAllPromos } from "../features/promoQueries/getAllPromos.js";
import { getPendingReports } from "../features/promoQueries/getPendingReports.js";
import { getPromoPartnerById } from "../features/promoQueries/getPromoPartnerById.js";
import { markReportReceived } from "../features/report/markReportReceived.js";
import { splitMessage } from "./formatters/splitMessage.js";
import { presentPromoCallback } from "./presentPromoCallback.js";
import { pendingPromoStore } from "./state/pendingPromoStore.js";
import { getActivePromoView } from "./workflows/activeWorkflow.js";
import { handlePromoCallback } from "./workflows/promoCallbackWorkflow.js";
import { handlePromoSubject } from "./workflows/promoSubjectWorkflow.js";
import { handleReportReceived } from "./workflows/reportCallbackWorkflow.js";
import { getPendingReportViews } from "./workflows/reportsWorkflow.js";

const START_TEXT = `Promo Tracker

Надішліть subject промо-листа, і я розпізнаю активність.

Доступні команди:
/active - активні промо
/reports - звіти, які очікуються
/help - допомога`;

const HELP_TEXT = `1. Скопіюйте subject промо-листа.
2. Надішліть його боту.
3. Перевірте розпізнані дані.
4. Натисніть Add для збереження.

Commands:
/active
/reports`;

export function createBot(token: string | undefined = process.env.TELEGRAM_BOT_TOKEN): Bot {
  if (!token?.trim()) throw new Error("TELEGRAM_BOT_TOKEN is required to start Promo Tracker bot");
  const bot = new Bot(token);

  bot.command("start", (ctx) => ctx.reply(START_TEXT));
  bot.command("help", (ctx) => ctx.reply(HELP_TEXT));
  bot.command("active", async (ctx) => {
    for (const chunk of splitMessage(await getActivePromoView(getAllPromos))) {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    }
  });
  bot.command("reports", async (ctx) => {
    const reports = await getPendingReportViews(getPendingReports);
    if (reports.length === 0) {
      await ctx.reply("✅ Немає звітів, які очікуються.");
      return;
    }
    await ctx.reply("🟡 Reports pending");
    for (const report of reports) {
      const keyboard = new InlineKeyboard().text(
        "✅ Report received",
        `report:received:${report.promoPartnerId}`,
      );
      await ctx.reply(report.text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  });

  bot.on("message:text", async (ctx) => {
    const result = handlePromoSubject(
      ctx.message.text,
      { chatId: ctx.chat.id, userId: ctx.from.id },
      pendingPromoStore,
    );
    if (result.kind === "ignored") return;
    if (result.kind === "invalid") {
      await ctx.reply(result.text, { parse_mode: "HTML" });
      return;
    }
    const keyboard = new InlineKeyboard()
      .text("✅ Add", `promo:add:${result.confirmationId}`)
      .text("❌ Cancel", `promo:cancel:${result.confirmationId}`);
    await ctx.reply(result.text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  bot.on("callback_query:data", async (ctx) => {
    let answer = "Done";
    try {
      const data = ctx.callbackQuery.data;
      if (data.startsWith("promo:")) {
        const [, action, id] = data.split(":");
        if ((action !== "add" && action !== "cancel") || !id) {
          answer = "Unknown action";
        } else {
          const result = await handlePromoCallback(
            action,
            id,
            { chatId: ctx.chat?.id ?? 0, userId: ctx.from.id },
            pendingPromoStore,
            createPromoFromParsedSubject,
          );
          const presentation = presentPromoCallback(result);
          answer = presentation.answer;
          await ctx.editMessageText(presentation.text, { parse_mode: "HTML" });
        }
      } else if (data.startsWith("report:received:")) {
        const id = data.slice("report:received:".length);
        const result = await handleReportReceived(id, getPromoPartnerById, markReportReceived);
        answer = result === "marked" ? "Report marked as received" : "Report already handled";
        await ctx.editMessageText(
          result === "marked"
            ? "✅ Report marked as received"
            : result === "already-received"
              ? "ℹ️ Report already marked as received"
              : "⚠️ Report not found",
        );
      } else {
        answer = "Unknown action";
      }
    } catch (error) {
      console.error("Telegram callback failed", error);
      answer = "Сталася помилка. Спробуйте ще раз.";
    } finally {
      await ctx.answerCallbackQuery({ text: answer }).catch(() => undefined);
    }
  });

  bot.catch(({ error }) => console.error("Telegram bot error", error));
  return bot;
}
