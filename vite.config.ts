import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [
    react(),
    glsl({
      include: ["**/*.glsl", "**/*.vert", "**/*.frag", "**/*.vs", "**/*.fs"],
      minify: false,
      watch: true,
    }),
  ],
  server: { host: true },
  assetsInclude: ["**/*.wgsl"],
});
