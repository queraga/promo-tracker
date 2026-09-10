import bcrypt from "bcrypt";

const HASH_ROUNDS = 12;
export function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("Password must contain at least 8 characters");
  return bcrypt.hash(password, HASH_ROUNDS);
}
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
