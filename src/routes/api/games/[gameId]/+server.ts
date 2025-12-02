import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameManager } from '$lib/server/game-manager';

export const GET: RequestHandler = async ({ params }) => {
	const game = gameManager.getGame(params.gameId);
	
	if (!game) {
		return json({ error: 'Game not found' }, { status: 404 });
	}
	
	return json({ game });
};
