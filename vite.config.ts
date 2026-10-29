import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// As telas vão dentro do APK (pasta dist/, copiada pelo `cap sync`). Sem
// service worker e sem PWA: o app não é um site, abre do disco do celular.
export default defineConfig({
  server: {
    port: 8081,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // WebView do Android 7 (minSdk 24) atualizado pela Play: Chrome recente.
    target: "es2020",
    // O pacote abre do disco, não da rede: um arquivo maior não custa download.
    chunkSizeWarningLimit: 2000,
  },
});
