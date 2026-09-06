import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import pino from 'pino';
import express, { type Express } from 'express';
import type { GameRoom } from './rooms/GameRoom.js';
export const log = pino({
  base: undefined,
  redact: ['password', 'token', 'authorization'],
});
export const liveRooms = new Map<string, { room: GameRoom; created: number }>();
export function maxRooms() {
  const n = Number(process.env.MAX_ROOMS ?? 20);
  if (!Number.isInteger(n) || n < 1 || n > 1000)
    throw new Error('MAX_ROOMS must be an integer from 1 to 1000');
  return n;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const digest = (s: string) => createHash('sha256').update(s).digest();
export function installAdmin(app: Express) {
  const csrf = randomBytes(32).toString('hex');
  app.use('/admin', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return void res.status(404).send('Admin is disabled.');
    const value = req.get('authorization') ?? '';
    let credentials = '';
    if (value.startsWith('Basic ') && value.length < 4096)
      credentials = Buffer.from(value.slice(6), 'base64').toString('utf8');
    if (!timingSafeEqual(digest(credentials), digest(`admin:${password}`)))
      return void res
        .status(401)
        .set('WWW-Authenticate', 'Basic realm="Mutiny host", charset="UTF-8"')
        .send('Host authentication required.');
    next();
  });
  app.get('/admin', (_req, res) => {
    const rows = [...liveRooms]
      .map(
        ([id, { room, created }]) =>
          `<tr><th scope="row">${escape(id)}</th><td>${room.state.players.size}</td><td>${escape(room.state.phase)}</td><td>${Math.floor((Date.now() - created) / 60000)} min</td><td><form method="post" action="/admin/close"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="room" value="${escape(id)}"><label><input type="checkbox" name="confirm" value="yes" required> End this room</label><button>Close room</button></form></td></tr>`,
      )
      .join('');
    res
      .type('html')
      .send(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mutiny · Host station</title><style>body{font:16px/1.5 'Trebuchet MS',sans-serif;background:#091219;color:#dde6e4;max-width:980px;margin:40px auto;padding:0 20px}h1{color:#99ddcc}table{border-collapse:collapse;width:100%}th,td{padding:12px;text-align:left;border-bottom:1px solid #71888e}button{font:inherit;min-height:44px;background:#f59185;color:#182124;border:0;padding:8px 16px;cursor:pointer}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #f3c681;outline-offset:3px}a{color:#99ddcc}form{display:flex;flex-wrap:wrap;gap:12px;align-items:center}label{display:flex;align-items:center;min-height:44px}input{width:20px;height:20px}section{overflow:auto}caption{text-align:left;padding:16px 0}p{max-width:70ch}</style><h1>Host station</h1><p>${liveRooms.size} / ${maxRooms()} rooms · server up ${Math.floor(process.uptime() / 60)} minutes.</p><p>Closing a room disconnects everyone and discards its round. This cannot be undone.</p><p><a href="/admin">Refresh room list</a></p><section aria-label="Live rooms"><table><caption>Active rooms</caption><thead><tr><th>Code</th><th>Players</th><th>Phase</th><th>Uptime</th><th>Host action</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No rooms running. Create one from the game.</td></tr>'}</tbody></table></section></html>`,
      );
  });
  app.post(
    '/admin/close',
    express.urlencoded({ extended: false, limit: '2kb' }),
    async (req, res) => {
      if (req.body?.csrf !== csrf || req.body?.confirm !== 'yes')
        return void res
          .status(403)
          .send(
            'Confirmation expired or missing. Return to /admin and try again.',
          );
      const id = req.body.room;
      if (typeof id !== 'string' || !liveRooms.has(id))
        return void res
          .status(404)
          .send('Room already closed. Return to /admin.');
      log.info({ event: 'admin.close', roomId: id }, 'Host closed room');
      await liveRooms.get(id)!.room.disconnect();
      res.redirect(303, '/admin');
    },
  );
}
