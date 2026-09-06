export type Sound =
  | 'button'
  | 'meeting'
  | 'vote'
  | 'ejection'
  | 'kill'
  | 'task'
  | 'step'
  | 'vent'
  | 'end'
  | 'alarm';
export type Volumes = { master: number; music: number; sfx: number };
export function volumes(value: unknown): Volumes {
  const v =
    value && typeof value === 'object' ? (value as Partial<Volumes>) : {};
  const clamp = (n: unknown, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n)
      ? Math.max(0, Math.min(1, n))
      : fallback;
  return {
    master: clamp(v.master, 0.65),
    music: clamp(v.music, 0.25),
    sfx: clamp(v.sfx, 0.7),
  };
}
export function falloff(distance: number) {
  return Math.max(0, 1 - distance / 600) ** 2;
}
/** Original oscillator score; no downloaded samples or audio licensing dependencies. */
export class AudioManager {
  settings = volumes(undefined);
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private sfx?: GainNode;
  private drones: OscillatorNode[] = [];
  private ambient = false;
  constructor() {
    try {
      this.settings = volumes(
        JSON.parse(localStorage.getItem('mutiny.audio') ?? 'null'),
      );
    } catch {
      /* Storage is optional. */
    }
    if (typeof document === 'undefined') return;
    const unlock = () => {
      void this.unlock();
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.context?.suspend();
      else if (this.context) void this.unlock();
    });
    document.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('button,summary'))
        this.play('button');
    });
  }
  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.sfx = this.context.createGain();
        this.music.connect(this.master);
        this.sfx.connect(this.master);
        this.master.connect(this.context.destination);
        this.apply();
        this.setAmbient(this.ambient);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      /* Audio is optional; game controls remain usable. */
    }
  }
  set(channel: keyof Volumes, value: number) {
    this.settings = volumes({ ...this.settings, [channel]: value });
    this.apply();
    try {
      localStorage.setItem('mutiny.audio', JSON.stringify(this.settings));
    } catch {
      /* Private browsing may prohibit storage. */
    }
  }
  private apply() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master!.gain.setTargetAtTime(this.settings.master, now, 0.02);
    this.music!.gain.setTargetAtTime(this.settings.music * 0.035, now, 0.02);
    this.sfx!.gain.setTargetAtTime(this.settings.sfx * 0.15, now, 0.02);
  }
  setAmbient(active: boolean) {
    this.ambient = active;
    if (!this.context) return;
    if (active && !this.drones.length) {
      for (const hz of [55, 82.5, 110.3]) {
        const tone = this.context.createOscillator();
        tone.frequency.value = hz;
        tone.type = 'sine';
        tone.connect(this.music!);
        tone.start();
        this.drones.push(tone);
      }
    } else if (!active) {
      this.drones.forEach((o) => {
        o.stop();
        o.disconnect();
      });
      this.drones = [];
    }
  }
  play(sound: Sound, distance = 0, pan = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || document.hidden) return;
    const gain = falloff(distance);
    if (!gain) return;
    const notes: Record<Sound, number[]> = {
      button: [560],
      meeting: [220, 330, 440],
      vote: [740],
      ejection: [440, 220, 80],
      kill: [130, 48],
      task: [440, 554, 660],
      step: [65],
      vent: [180, 65],
      end: [262, 330, 392, 524],
      alarm: [330, 440],
    };
    const duration = sound === 'step' || sound === 'button' ? 0.055 : 0.19;
    notes[sound].forEach((hz, i) => {
      const o = ctx.createOscillator(),
        envelope = ctx.createGain(),
        panner = ctx.createStereoPanner(),
        at = ctx.currentTime + i * duration;
      o.type = ['kill', 'vent', 'step'].includes(sound) ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(hz, at);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(25, hz * 0.7),
        at + duration,
      );
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(gain, at + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + duration);
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      o.connect(envelope);
      envelope.connect(panner);
      panner.connect(this.sfx!);
      o.start(at);
      o.stop(at + duration + 0.02);
      o.onended = () => {
        o.disconnect();
        envelope.disconnect();
        panner.disconnect();
      };
    });
  }
  controls(host: HTMLElement) {
    const panel = document.createElement('details');
    panel.className = 'audio-settings';
    const summary = document.createElement('summary');
    summary.textContent = 'Sound';
    panel.append(summary);
    for (const channel of ['master', 'music', 'sfx'] as const) {
      const label = document.createElement('label'),
        input = document.createElement('input'),
        output = document.createElement('output');
      label.append(
        channel === 'sfx'
          ? 'Effects'
          : channel === 'music'
            ? 'Station ambience'
            : 'Master',
      );
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(this.settings[channel] * 100));
      output.value = input.value + '%';
      input.oninput = () => {
        this.set(channel, Number(input.value) / 100);
        output.value = input.value + '%';
      };
      label.append(input, output);
      panel.append(label);
    }
    const help = document.createElement('p');
    help.textContent = 'Set Master to 0 to mute. Saved on this browser.';
    panel.append(help);
    host.append(panel);
    return panel;
  }
}
export const audio = new AudioManager();
