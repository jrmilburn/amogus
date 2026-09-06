import { StationGame, type TaskSoundHook } from './BatchA';
import {
  AccessSequence,
  CardSwipe,
  DebrisField,
  FuelMeter,
} from './batchBModels';
import './batchB.css';

/** THESIS: maintenance is physical—pump, clear, remember, swipe.
 * OWN-WORLD: amber canister fluid, ribbed cold-metal duct, five-cell keypad,
 * and a numbered engineer pass share the established station instrument palette.
 * STORY: act on the instrument; recover locally from mistakes; keep saved long stages.
 * FIRST VIEWPORT: a labelled instrument, 48px+ controls, instructions and live feedback.
 * FORM: four inserts in the existing focus-protected modal; no replacement world.
 */
export class FuelTask extends StationGame {
  private meter = new FuelMeter();
  private held = false;
  private previous = 0;
  private fill!: HTMLElement;
  private progress!: HTMLProgressElement;
  constructor(
    private step: number,
    duration: number,
    sound: TaskSoundHook,
  ) {
    super(duration, sound);
  }
  protected build() {
    const filling = this.step === 1;
    this.root.innerHTML = `<p>${filling ? 'Fill the transport canister, then carry it to the engine.' : 'Empty the canister into the engine intake.'} Hold for five seconds. Releasing pauses the pump.</p><div class="fuel-canister" aria-hidden="true"><div class="fuel-fluid"></div><span>FUEL</span></div><progress max="1" value="0" aria-label="${filling ? 'Filling' : 'Emptying'} progress"></progress><button type="button" class="instrument-primary pump-button">Hold to ${filling ? 'fill' : 'empty'}</button>`;
    this.fill = this.root.querySelector('.fuel-fluid')!;
    this.fill.style.height = filling ? '0%' : '100%';
    this.progress = this.root.querySelector('progress')!;
    const button = this.root.querySelector('button')!;
    const options = { signal: this.events.signal };
    const stop = () => {
      this.held = false;
    };
    button.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        button.focus();
        button.setPointerCapture(e.pointerId);
        this.held = true;
        this.sound('transfer-start');
      },
      options,
    );
    for (const event of [
      'pointerup',
      'pointercancel',
      'lostpointercapture',
      'blur',
    ])
      button.addEventListener(event, stop, options);
    button.addEventListener(
      'keydown',
      (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          this.held = true;
        }
      },
      options,
    );
    button.addEventListener(
      'keyup',
      (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          stop();
        }
      },
      options,
    );
    window.addEventListener('blur', stop, options);
    document.addEventListener('visibilitychange', stop, options);
  }
  protected override frame() {
    const value = this.meter.advance(this.elapsed - this.previous, this.held);
    this.previous = this.elapsed;
    this.progress.value = value;
    this.fill.style.height = `${(this.step === 1 ? value : 1 - value) * 100}%`;
    if (value === 1) {
      this.held = false;
      this.solve();
    }
  }
}

export class ClearVentsTask extends StationGame {
  private debris = new DebrisField();
  private selected?: number;
  private dragging?: {
    id: number;
    node: HTMLButtonElement;
    x: number;
    y: number;
  };
  private duct!: HTMLElement;
  protected build() {
    this.root.innerHTML =
      '<p>Drag all five pieces out of the duct. Or select a piece, then press Remove selected.</p><div class="vent-duct" aria-label="Duct debris"></div><button type="button" class="instrument-primary debris-remove">Remove selected</button>';
    this.duct = this.root.querySelector('.vent-duct')!;
    const names = ['Foil', 'Bolt', 'Wire', 'Leaf', 'Chip'];
    const options = { signal: this.events.signal };
    names.forEach((name, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `duct-debris debris-${index}`;
      button.textContent = name;
      button.setAttribute('aria-pressed', 'false');
      button.style.left = `${[4, 40, 68, 15, 54][index]}%`;
      button.style.top = `${[12, 5, 42, 65, 72][index]}%`;
      this.duct.append(button);
      button.addEventListener('click', () => this.select(index), options);
      button.addEventListener(
        'pointerdown',
        (e) => {
          if (e.button !== 0 || this.dragging) return;
          button.setPointerCapture(e.pointerId);
          this.select(index);
          this.dragging = {
            id: e.pointerId,
            node: button,
            x: e.clientX,
            y: e.clientY,
          };
        },
        options,
      );
      button.addEventListener(
        'pointermove',
        (e) => {
          if (this.dragging?.id === e.pointerId)
            button.style.transform = `translate(${e.clientX - this.dragging.x}px, ${e.clientY - this.dragging.y}px)`;
        },
        options,
      );
      button.addEventListener(
        'pointerup',
        (e) => {
          if (this.dragging?.id !== e.pointerId) return;
          const box = this.duct.getBoundingClientRect();
          this.resetDrag();
          this.remove(
            index,
            e.clientX < box.left ||
              e.clientX > box.right ||
              e.clientY < box.top ||
              e.clientY > box.bottom,
          );
        },
        options,
      );
      for (const event of ['pointercancel', 'lostpointercapture'])
        button.addEventListener(event, () => this.resetDrag(), options);
    });
    this.root.querySelector('.debris-remove')!.addEventListener(
      'click',
      () => {
        if (this.selected !== undefined) this.remove(this.selected, true);
        else this.status.textContent = 'Select a piece of debris first.';
      },
      options,
    );
    window.addEventListener('blur', () => this.resetDrag(), options);
  }
  private resetDrag() {
    if (this.dragging) this.dragging.node.style.transform = '';
    this.dragging = undefined;
  }
  private select(index: number) {
    if (this.debris.removed.has(index)) return;
    this.selected = index;
    this.sound('pick');
    this.duct
      .querySelectorAll('button')
      .forEach((button, i) =>
        button.setAttribute('aria-pressed', String(index === i)),
      );
    this.status.textContent =
      'Selected. Drag outside the duct or choose Remove selected.';
  }
  private remove(index: number, outside: boolean) {
    if (!this.debris.remove(index, outside)) return;
    const button = this.duct.querySelectorAll('button')[index]!;
    button.hidden = true;
    button.disabled = true;
    this.selected = undefined;
    this.sound('connect');
    this.status.textContent = `${this.debris.removed.size} of 5 pieces cleared.`;
    if (this.debris.complete) this.solve();
    else this.duct.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }
}

export class AccessCodeTask extends StationGame {
  private accepted = false;
  private model = new AccessSequence(
    [...crypto.getRandomValues(new Uint8Array(5))].map((n) => n % 10).join(''),
  );
  private display!: HTMLElement;
  private input!: HTMLElement;
  private keypad!: HTMLElement;
  private showing = false;
  protected build() {
    this.root.innerHTML =
      '<p>Reveal a five-digit code for two seconds, then enter it on the keypad. Keyboard: digits, Backspace, Enter to submit; Space activates a focused key. Reveal again to retry.</p><output class="access-display" aria-live="polite" aria-label="Memory code">Ready</output><button type="button" class="instrument-primary access-reveal">Reveal code</button><p class="access-input" aria-live="polite" aria-label="Entered digits">_ _ _ _ _</p><div class="access-keypad" aria-label="Code keypad"></div>';
    this.display = this.root.querySelector('.access-display')!;
    this.input = this.root.querySelector('.access-input')!;
    this.keypad = this.root.querySelector('.access-keypad')!;
    const options = { signal: this.events.signal };
    for (const key of [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'Delete',
      '0',
      'Enter',
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = key;
      button.disabled = true;
      this.keypad.append(button);
      button.addEventListener('click', () => this.press(key), options);
    }
    this.root.querySelector('.access-reveal')!.addEventListener(
      'click',
      () => {
        this.model.reveal(this.elapsed);
        this.showing = true;
        this.display.textContent = this.model.code.split('').join(' ');
        this.input.textContent = '_ _ _ _ _';
        this.keypad.querySelectorAll('button').forEach((b) => {
          b.disabled = true;
        });
        this.status.textContent = 'Remember these five digits.';
      },
      options,
    );
    this.root.addEventListener(
      'keydown',
      (e) => {
        if (
          e.repeat ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          !this.model.canEnter(this.elapsed)
        )
          return;
        if (/^\d$/.test(e.key) || ['Backspace', 'Delete'].includes(e.key)) {
          e.preventDefault();
          this.press(e.key === 'Backspace' ? 'Delete' : e.key);
        }
        if (
          e.key === 'Enter' &&
          !(
            e.target instanceof HTMLElement &&
            e.target.closest('.access-reveal')
          )
        ) {
          e.preventDefault();
          this.press('Enter');
        }
      },
      options,
    );
  }
  private press(key: string) {
    if (this.accepted || !this.model.canEnter(this.elapsed)) return;
    if (key === 'Delete') this.model.erase();
    else if (key === 'Enter') {
      if (this.model.submit(this.elapsed)) {
        this.accepted = true;
        this.solve();
        return;
      }
      this.sound('reject');
      this.status.textContent =
        'Code did not match. Delete to correct it, or reveal it again.';
    } else {
      this.model.digit(key, this.elapsed);
      this.sound('pick');
    }
    this.input.textContent = this.model.input
      .padEnd(5, '_')
      .split('')
      .join(' ');
  }
  protected override frame() {
    if (this.showing && !this.model.visible(this.elapsed)) {
      this.showing = false;
      this.display.textContent = 'Code hidden';
      this.keypad.querySelectorAll('button').forEach((b) => {
        b.disabled = false;
      });
      this.status.textContent = 'Enter the five digits, then choose Enter.';
      this.keypad.querySelector('button')?.focus();
    }
  }
}

export class ScanIdTask extends StationGame {
  private model = new CardSwipe();
  private track!: HTMLElement;
  private card!: HTMLButtonElement;
  private drag?: { id: number; x: number; travel: number };
  private heldAt?: number;
  private accepted = false;
  protected build() {
    this.root.innerHTML =
      '<p>Drag the pass from left to right in 0.8–1.6 seconds. Too fast, too slow, or reversing fails. Alternatively hold the swipe button for about one second, then release.</p><div class="id-reader"><span class="reader-finish">END</span><button type="button" class="engineer-pass" aria-label="Drag engineer pass right">ENGINEER<br>PASS 07<br>→</button></div><button type="button" class="instrument-primary scan-hold">Hold to swipe, release to scan</button>';
    this.track = this.root.querySelector('.id-reader')!;
    this.card = this.root.querySelector('.engineer-pass')!;
    const options = { signal: this.events.signal };
    this.card.addEventListener(
      'pointerdown',
      (e) => {
        if (
          e.button !== 0 ||
          this.accepted ||
          this.drag ||
          this.heldAt !== undefined
        )
          return;
        e.preventDefault();
        this.card.focus();
        this.card.setPointerCapture(e.pointerId);
        this.model.begin(this.elapsed);
        this.drag = {
          id: e.pointerId,
          x: e.clientX,
          travel: Math.max(1, this.track.clientWidth - this.card.offsetWidth),
        };
      },
      options,
    );
    this.card.addEventListener(
      'pointermove',
      (e) => {
        if (this.drag?.id === e.pointerId) {
          this.model.move((e.clientX - this.drag.x) / this.drag.travel);
          this.draw();
        }
      },
      options,
    );
    this.card.addEventListener(
      'pointerup',
      (e) => {
        if (this.drag?.id !== e.pointerId) return;
        this.model.move((e.clientX - this.drag.x) / this.drag.travel);
        this.drag = undefined;
        this.finish();
      },
      options,
    );
    for (const event of ['pointercancel', 'lostpointercapture'])
      this.card.addEventListener(
        event,
        () => {
          if (this.drag) this.cancel();
        },
        options,
      );
    const hold = this.root.querySelector<HTMLButtonElement>('.scan-hold')!;
    const begin = () => {
      if (this.accepted || this.drag || this.heldAt !== undefined) return;
      this.heldAt = this.elapsed;
      this.model.begin(this.elapsed);
    };
    const end = () => {
      if (this.heldAt === undefined) return;
      this.model.move((this.elapsed - this.heldAt) / 1000);
      this.heldAt = undefined;
      this.finish();
    };
    hold.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        hold.focus();
        hold.setPointerCapture(e.pointerId);
        begin();
      },
      options,
    );
    hold.addEventListener('pointerup', end, options);
    for (const event of ['pointercancel', 'lostpointercapture', 'blur'])
      hold.addEventListener(
        event,
        () => {
          if (this.heldAt !== undefined) this.cancel();
        },
        options,
      );
    hold.addEventListener(
      'keydown',
      (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          begin();
        }
      },
      options,
    );
    hold.addEventListener(
      'keyup',
      (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          end();
        }
      },
      options,
    );
    window.addEventListener('blur', () => this.cancel(), options);
    document.addEventListener('visibilitychange', () => this.cancel(), options);
  }
  private draw() {
    this.card.style.transform = `translateX(${this.model.position * (this.track.clientWidth - this.card.offsetWidth)}px)`;
  }
  protected override frame() {
    if (this.heldAt !== undefined) {
      this.model.move((this.elapsed - this.heldAt) / 1000);
      this.draw();
    }
  }
  private cancel() {
    if (this.accepted) return;
    this.drag = undefined;
    this.heldAt = undefined;
    this.model.cancel();
    this.draw();
  }
  private finish() {
    this.draw();
    const result = this.model.finish(this.elapsed);
    if (result === 'ok') {
      this.accepted = true;
      this.sound('lock');
      this.solve();
      return;
    }
    this.sound('reject');
    this.status.textContent = {
      incomplete: 'Swipe all the way to END.',
      reversed: 'Keep moving right without reversing.',
      fast: 'Too fast. Try a slower swipe.',
      slow: 'Too slow. Try a quicker swipe.',
    }[result];
    this.model.cancel();
    this.draw();
  }
}
