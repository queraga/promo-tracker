import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: ["ui/**", "node_modules/**"] },
});
