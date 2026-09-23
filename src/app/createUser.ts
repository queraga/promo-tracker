import { Prisma } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { createUser } from "../features/auth/createUser.js";
import { prisma } from "../shared/db/prisma.js";

try { process.loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
class HiddenOutput extends Writable {
  muted = false;
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) { if (!this.muted) stdout.write(chunk); callback(); }
}
const hiddenOutput = new HiddenOutput();
const input = createInterface({ input: stdin, output: hiddenOutput, terminal: true });
try {
  const email = process.argv[2] ?? await input.question("Email: ");
  const role = (process.argv[3] ?? await input.question("Role (KAM/PLM/SUPERUSER): ")).toUpperCase();
  const passwordQuestion = input.question("Password: ");
  hiddenOutput.muted = true;
  const password = await passwordQuestion;
  hiddenOutput.muted = false;
  stdout.write("\n");
  const user = await createUser(email, password, role);
  console.log(`Created ${user.role}: ${user.email}`);
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") console.error("A user with this email already exists");
  else console.error(error instanceof Error ? error.message : "User creation failed");
  process.exitCode = 1;
} finally { input.close(); await prisma.$disconnect(); }
