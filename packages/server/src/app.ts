import { createServer } from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import {
  GAME_ROOM,
  PLACEHOLDER_ROOM,
  type HealthResponse,
} from '@mutiny/shared';
import { GameRoom } from './rooms/GameRoom.js';
import { PlaceholderRoom } from './rooms/PlaceholderRoom.js';

export function createGameServer() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', async (_request, response) => {
    const rooms = await matchMaker.query({});
    response.json({ ok: true, rooms: rooms.length } satisfies HealthResponse);
  });
  const httpServer = createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    gracefullyShutdown: false,
  });
  gameServer.define(PLACEHOLDER_ROOM, PlaceholderRoom);
  gameServer.define(GAME_ROOM, GameRoom);
  return { gameServer, httpServer };
}
