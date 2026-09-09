try {
  process.loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

const [{ createBot }, { startBot }] = await Promise.all([
  import("../bot/createBot.js"),
  import("../bot/startBot.js"),
]);

await startBot(createBot());
