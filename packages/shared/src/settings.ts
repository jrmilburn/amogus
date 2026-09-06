export interface SettingsValues {
  impostors: number;
  killCooldown: number;
  emergencyMeetings: number;
  discussionTime: number;
  votingTime: number;
  playerSpeed: number;
  crewVision: number;
  impostorVision: number;
  tasksShort: number;
  tasksLong: number;
  confirmEjects: boolean;
  anonymousVotes: boolean;
}

export const DEFAULT_SETTINGS: Readonly<SettingsValues> = {
  impostors: 1,
  killCooldown: 30,
  emergencyMeetings: 1,
  discussionTime: 30,
  votingTime: 60,
  playerSpeed: 200,
  crewVision: 1,
  impostorVision: 1.5,
  tasksShort: 2,
  tasksLong: 1,
  confirmEjects: true,
  anonymousVotes: true,
};

type Field = { label: string; hint: string } & (
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'boolean' }
);
export const SETTINGS_FIELDS = {
  impostors: {
    label: 'Impostors',
    hint: 'Two impostors require at least 7 players.',
    kind: 'number',
    min: 1,
    max: 2,
    step: 1,
  },
  killCooldown: {
    label: 'Kill cooldown',
    hint: 'Seconds between kills.',
    kind: 'number',
    min: 10,
    max: 60,
    step: 5,
  },
  emergencyMeetings: {
    label: 'Emergency meetings',
    hint: 'Calls allowed per player.',
    kind: 'number',
    min: 0,
    max: 5,
    step: 1,
  },
  discussionTime: {
    label: 'Discussion time',
    hint: 'Seconds before voting begins.',
    kind: 'number',
    min: 0,
    max: 120,
    step: 5,
  },
  votingTime: {
    label: 'Voting time',
    hint: 'Seconds to cast a vote.',
    kind: 'number',
    min: 15,
    max: 180,
    step: 5,
  },
  playerSpeed: {
    label: 'Player speed',
    hint: 'Higher values let everyone move faster.',
    kind: 'number',
    min: 80,
    max: 240,
    step: 10,
  },
  crewVision: {
    label: 'Crew vision',
    hint: 'Multiplier of the normal vision radius.',
    kind: 'number',
    min: 0.5,
    max: 2,
    step: 0.25,
  },
  impostorVision: {
    label: 'Impostor vision',
    hint: 'Multiplier of the normal vision radius.',
    kind: 'number',
    min: 0.5,
    max: 3,
    step: 0.25,
  },
  tasksShort: {
    label: 'Short tasks',
    hint: 'Assigned to each crew member.',
    kind: 'number',
    min: 0,
    max: 5,
    step: 1,
  },
  tasksLong: {
    label: 'Long tasks',
    hint: 'Assigned to each crew member.',
    kind: 'number',
    min: 0,
    max: 3,
    step: 1,
  },
  confirmEjects: {
    label: 'Confirm ejections',
    hint: 'Reveal whether the ejected player was an impostor.',
    kind: 'boolean',
  },
  anonymousVotes: {
    label: 'Anonymous votes',
    hint: 'Hide who voted for whom.',
    kind: 'boolean',
  },
} as const satisfies Record<keyof SettingsValues, Field>;
export const SETTING_KEYS = Object.keys(
  SETTINGS_FIELDS,
) as (keyof SettingsValues)[];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate the entire patch before mutating any server state. */
export function validateSettingsPatch(
  value: unknown,
  current: SettingsValues,
): Partial<SettingsValues> {
  if (!isRecord(value) || Object.keys(value).length === 0)
    throw new Error('Choose a setting to update.');
  for (const [key, proposed] of Object.entries(value)) {
    if (!Object.hasOwn(SETTINGS_FIELDS, key))
      throw new Error('Unknown game setting.');
    const field: Field = SETTINGS_FIELDS[key as keyof SettingsValues];
    if (field.kind === 'boolean') {
      if (typeof proposed !== 'boolean')
        throw new Error(`${field.label} must be on or off.`);
    } else {
      if (
        typeof proposed !== 'number' ||
        !Number.isFinite(proposed) ||
        proposed < field.min ||
        proposed > field.max ||
        Math.abs(
          (proposed - field.min) / field.step -
            Math.round((proposed - field.min) / field.step),
        ) > 1e-8
      ) {
        throw new Error(
          `${field.label} must be ${field.min}–${field.max} in steps of ${field.step}.`,
        );
      }
    }
  }
  const patch = value as Partial<SettingsValues>;
  const merged = { ...current, ...patch };
  if (merged.tasksShort + merged.tasksLong === 0)
    throw new Error('Assign at least one task per player.');
  return patch;
}

export function sanitizeName(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64)
    throw new Error('Enter a name with 2–12 characters.');
  const name = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N} '-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if ([...name].length < 2 || [...name].length > 12)
    throw new Error('Enter a name with 2–12 characters.');
  return name;
}

export function startRequirement(
  count: number,
  impostors: number,
): string | undefined {
  if (count < 4)
    return `Waiting for ${4 - count} more ${count === 3 ? 'player' : 'players'}.`;
  if (impostors === 2 && count < 7)
    return 'Two impostors need at least 7 players. Choose one impostor or invite more friends.';
  return undefined;
}
