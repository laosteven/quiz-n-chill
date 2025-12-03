import { createServer } from 'http';
import { handler } from './build/handler.js';
import { initSocketServer } from './src/lib/server/socket.js';

const port = process.env.PORT || 3000;
const server = createServer(handler);

initSocketServer(server);

server.listen(port, () => {
	console.log(`Server running on http://localhost:${port}`);
});
