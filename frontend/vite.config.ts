import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  server: {
    host: true, // Allow connections from outside
    strictPort: true,
    port: 5173,
    fs: {
      strict: false, // Allow serving files from outside root
    },
  },
  preview: {  // ← Add this entire section
    host: true,  // Bind to 0.0.0.0 for Docker accessibility
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '.localhost', 'frontend'],
  },
  build: {
    sourcemap: true,
  },
});
