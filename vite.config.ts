import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:arquivo` gera um único HTML que abre direto do computador (sem hospedagem)
export default defineConfig(({ mode }) =>
  mode === "arquivo"
    ? { plugins: [react(), viteSingleFile()], base: "./", build: { outDir: "dist-arquivo" } }
    : { plugins: [react()] },
);
