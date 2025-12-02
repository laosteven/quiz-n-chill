import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	// Access the global gameManager from server.js
	const gameManager = (global as any).gameManager;
	
	if (!gameManager) {
		return json({ error: 'Server not initialized' }, { status: 500 });
	}
	
	const game = gameManager.getGame(params.gameId);
	
	if (!game) {
		return json({ error: 'Game not found' }, { status: 404 });
	}
	
	return json({ game });
};
