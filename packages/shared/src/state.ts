import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
import { DEFAULT_SETTINGS, type SettingsValues } from './settings.js';
import type { ColorId } from './constants.js';

export type Role = 'crew' | 'impostor';
export type Phase =
  | 'lobby'
  | 'starting'
  | 'playing'
  | 'meeting'
  | 'voting'
  | 'ejection'
  | 'ended';
export type SabotageKind = 'lights' | 'reactor' | 'o2' | 'comms' | 'doors';

/** Public state only. Roles and assigned tasks belong in private server records. */
export class Player extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') color: ColorId = 'coral';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('int8') facing = 1;
  @type('boolean') walking = false;
  @type('boolean') alive = true;
  @type('boolean') ready = false;
  @type('boolean') isHost = false;
  @type('uint16') tasksDone = 0;
  @type('uint16') tasksTotal = 0;
  @type('boolean') inVent = false;
  @type('boolean') connected = true;
  @type('uint32') lastProcessedSeq = 0;
  @type('uint8') emergenciesUsed = 0;
}

export class Settings extends Schema implements SettingsValues {
  @type('uint8') impostors = DEFAULT_SETTINGS.impostors;
  @type('uint16') killCooldown = DEFAULT_SETTINGS.killCooldown;
  @type('uint8') emergencyMeetings = DEFAULT_SETTINGS.emergencyMeetings;
  @type('uint16') discussionTime = DEFAULT_SETTINGS.discussionTime;
  @type('uint16') votingTime = DEFAULT_SETTINGS.votingTime;
  @type('number') playerSpeed = DEFAULT_SETTINGS.playerSpeed;
  @type('number') crewVision = DEFAULT_SETTINGS.crewVision;
  @type('number') impostorVision = DEFAULT_SETTINGS.impostorVision;
  @type('uint8') tasksShort = DEFAULT_SETTINGS.tasksShort;
  @type('uint8') tasksLong = DEFAULT_SETTINGS.tasksLong;
  @type('boolean') confirmEjects = DEFAULT_SETTINGS.confirmEjects;
  @type('boolean') anonymousVotes = DEFAULT_SETTINGS.anonymousVotes;
}

export class MeetingChat extends Schema {
  @type('uint32') id = 0;
  @type('string') senderId = '';
  @type('string') name = '';
  @type('string') color: ColorId = 'coral';
  @type('string') text = '';
}
export class MeetingState extends Schema {
  @type('uint32') id = 0;
  @type('string') callerName = '';
  @type('string') callerColor: ColorId = 'coral';
  @type('string') reason: 'report' | 'emergency' = 'emergency';
  @type('string') callerId = '';
  @type('string') bodyColor?: ColorId;
  @type('string') location = '';
  @type('number') discussionEndsAt = 0;
  @type('number') votingEndsAt = 0;
  // Only the fact of voting is public. Targets remain server-private until tally.
  @type({ map: 'boolean' }) voted = new MapSchema<boolean>();
  @type([MeetingChat]) chat = new ArraySchema<MeetingChat>();
  /** Sanitized public voteResult JSON, populated only at tally for reopening the UI. */
  @type('string') result = '';
}

export class SabotageState extends Schema {
  @type('uint32') id = 0;
  @type('string') kind: SabotageKind = 'lights';
  @type('string') roomId = '';
  @type('number') endsAt = 0;
  @type(['string']) fixedPoints = new ArraySchema<string>();
  @type(['boolean']) switches = new ArraySchema<boolean>();
  @type(['boolean']) targetSwitches = new ArraySchema<boolean>();
  @type(['string']) heldPoints = new ArraySchema<string>();
  @type('number') holdProgress = 0;
}

export class Body extends Schema {
  @type('string') id = '';
  @type('string') victimId = '';
  @type('string') name = '';
  @type('string') color: ColorId = 'coral';
  @type('number') x = 0;
  @type('number') y = 0;
}

export class GameState extends Schema {
  @type('string') phase: Phase = 'lobby';
  @type('string') code = '';
  @type({ map: Player }) players = new MapSchema<Player>();
  @type(Settings) settings = new Settings();
  @type(MeetingState) meeting?: MeetingState;
  @type(SabotageState) sabotage?: SabotageState;
  @type('number') taskProgress = 0;
  @type('string') winner?: Role;
  @type('uint32') roundId = 0;
  @type('number') phaseEndsAt = 0;
  @type({ map: Body }) bodies = new MapSchema<Body>();
  @type({ map: 'number' }) closedDoors = new MapSchema<number>();
  @type('number') sabotageReadyAt = 0;
  @type('number') doorsReadyAt = 0;
  @type('number') serverNow = 0;
  @type('string') endReason = '';
  @type('number') emergencyReadyAt = 0;
  @type('string') finalResult = '';
}
