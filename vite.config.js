import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://<user>.github.io/NightReignEffects/
export default defineConfig({
  base: "/NightReignEffects/",
  plugins: [react()],
});
