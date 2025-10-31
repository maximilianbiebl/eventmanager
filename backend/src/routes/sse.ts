import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = Router();

// Store active SSE connections
interface SSEClient {
  id: string;
  userId: number;
  role: string;
  response: Response;
}

const clients: SSEClient[] = [];

// Helper to send SSE message to all clients
export function broadcastUpdate(type: 'task' | 'assignment' | 'event', data: any) {
  console.log(`Broadcasting ${type} update to ${clients.length} clients`);
  clients.forEach(client => {
    try {
      client.response.write(`data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`);
    } catch (error) {
      console.error('Error broadcasting to client:', error);
    }
  });
}

// SSE endpoint for real-time updates
router.get('/stream', (req: Request, res: Response) => {
  // Get token from query parameter (EventSource doesn't support custom headers)
  const token = req.query.token as string;

  if (!token) {
    res.status(401).json({ error: 'Keine Authentifizierung' });
    return;
  }

  // Verify token
  let user: any;
  try {
    user = jwt.verify(token, config.jwtSecret);
  } catch (error) {
    res.status(403).json({ error: 'Ungültiges Token' });
    return;
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const clientId = `${user.userId}-${Date.now()}`;
  const client: SSEClient = {
    id: clientId,
    userId: user.userId,
    role: user.role,
    response: res
  };

  // Add client to active connections
  clients.push(client);
  console.log(`SSE client connected: ${clientId} (${user.role}). Total clients: ${clients.length}`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Send keepalive every 30 seconds
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(`: keepalive\n\n`);
    } catch (error) {
      console.error('Keepalive error:', error);
      clearInterval(keepaliveInterval);
    }
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    const index = clients.findIndex(c => c.id === clientId);
    if (index !== -1) {
      clients.splice(index, 1);
      console.log(`SSE client disconnected: ${clientId}. Remaining clients: ${clients.length}`);
    }
  });
});

export default router;
