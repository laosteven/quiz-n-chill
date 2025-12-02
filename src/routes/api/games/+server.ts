import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GameConfig } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const config: GameConfig = await request.json();
	
	// Access the global gameManager from server.js
	const gameManager = (global as any).gameManager;
	
	if (!gameManager) {
		return json({ error: 'Server not initialized' }, { status: 500 });
	}
	
	const gameId = gameManager.createGame(config);
	console.log(`🎮 New game created with ID: ${gameId}`);
	
	return json({ gameId, success: true });
};
