import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameManager } from '$lib/server/game-manager';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const game = gameManager.getGame(params.gameId);

		if (!game) {
			return json({ error: 'Game not found' }, { status: 404 });
		}

		return json({ game });
	} catch (err) {
		console.error('Failed to fetch game:', err);
		return json({ error: 'Failed to fetch game' }, { status: 500 });
	}
};
