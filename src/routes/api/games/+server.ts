import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameManager } from '$lib/server/game-manager';
import type { GameConfig } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const config: GameConfig = await request.json();
	const gameId = gameManager.createGame(config);
	
	return json({ gameId, success: true });
};
