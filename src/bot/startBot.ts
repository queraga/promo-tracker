import type { Bot } from "grammy";
import { prisma } from "../shared/db/prisma.js";

export async function startBot(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Start Promo Tracker" },
    { command: "help", description: "How to use the bot" },
    { command: "active", description: "Show active promos" },
    { command: "reports", description: "Show pending reports" },
  ]);

  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    bot.stop();
    await prisma.$disconnect();
    console.log(`Promo Tracker bot stopped (${signal})`);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await bot.start({ onStart: () => console.log("Promo Tracker bot started") });
}
