import type { ColorId } from './constants.js';
import type { SettingsValues } from './settings.js';
import type { Role, SabotageKind } from './state.js';

export interface HealthResponse {
  ok: true;
  rooms: number;
}
export interface JoinOptions {
  name: string;
  color: ColorId;
}
export interface TaskAssignment {
  id: string;
  type: string;
  room: string;
  length: 'short' | 'long';
  step: number;
  steps: number;
  completed: boolean;
}
export interface PrivatePlayerState {
  role: Role;
  tasks: TaskAssignment[];
}
export type WinReason = 'tasks' | 'noImpostors' | 'parity' | 'reactor' | 'o2';
export type ErrorCode =
  | 'invalidPayload'
  | 'hostOnly'
  | 'wrongPhase'
  | 'colorTaken'
  | 'notEnoughPlayers'
  | 'notImplemented';

/** All coordinates use world pixels; times use seconds unless explicitly named otherwise. */
export interface ClientMessages {
  /** Direction components in [-1,1]; seq increases monotonically. */
  input: { seq: number; dx: number; dy: number };
  /** Request permission to open the assigned task at the current location. */
  useTask: { taskId: string };
  /** Intermediate progress of a long task; the server validates ordering. */
  taskProgress: { taskId: string; step: number };
  taskComplete: { taskId: string };
  kill: { targetId: string };
  vent: { action: 'enter' | 'move' | 'exit'; ventId: string };
  sabotage: { kind: SabotageKind; roomId?: string };
  /** Submitted panel action, never a client assertion that sabotage is fixed. */
  fixSabotage: {
    pointId: string;
    action: 'switch' | 'hold' | 'release' | 'code';
    switchIndex?: number;
    code?: string;
  };
  report: { bodyId: string };
  emergency: Record<string, never>;
  chat: { text: string; channel: 'living' | 'ghost' };
  /** null means skip; player IDs are session IDs. */
  vote: { targetId: string | null };
  updateSettings: Partial<SettingsValues>;
  start: Record<string, never>;
  /** Lobby-only identity updates; fields are optional but at least one is required. */
  updateProfile: { name?: string; color?: ColorId };
  ready: { ready: boolean };
  /** Temporary host action while the game loop is under construction. */
  cancelStart: Record<string, never>;
}

export interface ServerMessages {
  /** Private delivery only; crew receive an empty teammate list. */
  roleReveal: {
    role: Role;
    teammates: { id: string; name: string }[];
    durationMs: number;
  };
  /** Private delivery only, including fake lists for impostors. */
  taskList: { tasks: TaskAssignment[]; fake: boolean };
  killed: { victimId: string; bodyId: string; x: number; y: number };
  meetingStart: {
    reason: 'report' | 'emergency';
    callerId: string;
    bodyColor?: ColorId;
    location: string;
  };
  /** Omit voter IDs under anonymousVotes, and role under !confirmEjects. */
  voteResult: {
    ejectedId: string | null;
    counts: Record<string, number>;
    skipped: number;
    votes?: { voterId: string; targetId: string | null }[];
    role?: Role;
    impostorsRemaining: number;
  };
  gameOver: { winner: Role; reason: WinReason; roles: Record<string, Role> };
  error: { code: ErrorCode; message: string };
}

// Identity maps enforce that the exported names exactly match each payload map.
export const CLIENT_MESSAGES = {
  input: 'input',
  useTask: 'useTask',
  taskProgress: 'taskProgress',
  taskComplete: 'taskComplete',
  kill: 'kill',
  vent: 'vent',
  sabotage: 'sabotage',
  fixSabotage: 'fixSabotage',
  report: 'report',
  emergency: 'emergency',
  chat: 'chat',
  vote: 'vote',
  updateSettings: 'updateSettings',
  start: 'start',
  updateProfile: 'updateProfile',
  ready: 'ready',
  cancelStart: 'cancelStart',
} as const satisfies { [K in keyof ClientMessages]: K };
export const SERVER_MESSAGES = {
  roleReveal: 'roleReveal',
  taskList: 'taskList',
  killed: 'killed',
  meetingStart: 'meetingStart',
  voteResult: 'voteResult',
  gameOver: 'gameOver',
  error: 'error',
} as const satisfies { [K in keyof ServerMessages]: K };
