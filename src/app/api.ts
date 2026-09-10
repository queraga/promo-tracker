import { createApi } from "../api/createApi.js";
import { prisma } from "../shared/db/prisma.js";

try { process.loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port <= 0) throw new Error("PORT must be a positive integer");
const server = createApi().listen(port, () => console.log(`Promo Tracker API: http://localhost:${port}`));
async function shutdown() { server.close(); await prisma.$disconnect(); }
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
