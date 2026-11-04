import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const directory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });

export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/next-env.d.ts", "output/**", "test-results/**", "playwright-report/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { settings: { next: { rootDir: directory + "/web/" } } },
];
