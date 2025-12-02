import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameManager } from '$lib/server/game-manager';
import type { GameConfig } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const config: GameConfig = await request.json();
	console.log('🔧 API route - gameManager instance:', gameManager.constructor.name);
	const gameId = gameManager.createGame(config);
	console.log(`🎮 New game created with ID: ${gameId}`);
	
	return json({ gameId, success: true });
};
