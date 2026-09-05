import { Room } from '@colyseus/core';
import { MAX_PLAYERS, TICK_RATE } from '@mutiny/shared';

export class PlaceholderRoom extends Room {
  maxClients = MAX_PLAYERS;

  onCreate() {
    this.setPatchRate(1000 / TICK_RATE);
  }
}
