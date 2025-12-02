import "dotenv/config";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { Server as HTTPServer } from 'http';

export default defineConfig(() => {
  return {
    plugins: [
      sveltekit(),
      {
        name: "socket-io",
        async configureServer(server) {
          if (!server.httpServer) return;
          // Dynamic import to avoid issues with SvelteKit aliases
          const { setupSocketIO } = await import("./src/lib/server/socket.js");
          // Cast to any to accommodate Vite's dev server http implementation (http/https/http2)
          setupSocketIO(server.httpServer as HTTPServer);
          console.log("[dev] Socket server initialized using shared implementation");
        },
      },
    ],
    optimizeDeps: {
      include: ["svelte-sonner"],
    },
  };
});
