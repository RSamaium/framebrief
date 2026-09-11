import { defineConfig } from "vite";
import { workspacePlugin } from "./src/workspace-server";

export default defineConfig({
  plugins: [workspacePlugin()],
  server: { host: "127.0.0.1" },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
