import type { Bot } from "grammy";
import { createReminderProcessor, processDueReportReminders } from "../features/reportReminders/processDueReportReminders.js";
import { loadReminderConfig } from "../features/reportReminders/reminderConfig.js";
import { startReportReminderScheduler } from "../features/reportReminders/startReportReminderScheduler.js";
import { prisma } from "../shared/db/prisma.js";

export async function startBot(bot: Bot): Promise<void> {
  const reminderConfig = loadReminderConfig();
  const reminderDependencies = createReminderProcessor((message) =>
    bot.api.sendMessage(reminderConfig.chatId, message, { parse_mode: "HTML" }).then(() => undefined),
  );
  const stopReminders = startReportReminderScheduler(
    reminderConfig,
    (now, timeZone) => processDueReportReminders(now, timeZone, reminderDependencies),
  );
  await bot.api.setMyCommands([
    { command: "start", description: "Start Promo Tracker" },
    { command: "help", description: "How to use the bot" },
    { command: "active", description: "Show active promos" },
    { command: "reports", description: "Show pending reports" },
  ]);

  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    stopReminders();
    bot.stop();
    await prisma.$disconnect();
    console.log(`Promo Tracker bot stopped (${signal})`);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await bot.start({ onStart: () => console.log("Promo Tracker bot started") });
}
