import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { ViteDevServer } from 'vite';

const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) {
		if (!server.httpServer) return;
		
		import('./src/lib/server/socket').then(({ setupSocketIO }) => {
			setupSocketIO(server.httpServer!);
		});
	}
};

export default defineConfig({
	plugins: [sveltekit(), webSocketServer]
});
