import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameManager } from '$lib/server/game-manager';

export const GET: RequestHandler = async () => {
	// Get all game IDs for debugging
	const games = Array.from((gameManager as any).games.keys());
	
	return json({ 
		games,
		count: games.length 
	});
};
