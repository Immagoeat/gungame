import { Buttons, type Stance } from '@gungame/shared';

/** Keyboard/mouse state plus pointer lock. Mouse movement accumulates until consumed each frame. */
export class Input {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  mouseHeld = false;
  /** Set on click, cleared once a shot is attempted (semi-auto weapons fire once per click). */
  wantFire = false;
  aiming = false;
  /** Stance the player has toggled into (C crouch, Z prone); movement applies it when there is room. */
  stance: Stance = 'stand';
  /** Set when Space was used to stand up, so that press doesn't also jump. */
  jumpBlocked = false;

  onKeyDown: (code: string) => void = () => {};
  /** Mouse wheel while playing: +1 scrolls down, -1 up. */
  onWheel: (dir: 1 | -1) => void = () => {};
  private lastWheel = 0;
  onLockChange: (locked: boolean) => void = () => {};
  onLockError: () => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (e.code === 'Space' && this.locked) e.preventDefault();
      this.onKeyDown(e.code);
    });
    addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.jumpBlocked = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.clearActions(); });
    addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseHeld = true; this.wantFire = true; }
      if (e.button === 2) this.aiming = true;
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseHeld = false;
      if (e.button === 2) this.aiming = false;
    });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => {
      // One step per notch, however fast a free-spinning wheel or trackpad reports.
      if (!this.locked || e.deltaY === 0 || performance.now() - this.lastWheel < 120) return;
      this.lastWheel = performance.now();
      this.onWheel(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => this.onLockChange(this.locked));
    document.addEventListener('pointerlockerror', () => this.onLockError());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    // Failures are reported through the pointerlockerror event; ignore the promise rejection.
    Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookX, dy: this.lookY };
    this.lookX = this.lookY = 0;
    return out;
  }

  clearActions(): void {
    this.mouseHeld = this.wantFire = this.aiming = false;
    this.lookX = this.lookY = 0;
  }

  /** Current movement/action state as a network-friendly bitmask. */
  buttons(): number {
    let b = 0;
    if (this.isDown('KeyW')) b |= Buttons.Forward;
    if (this.isDown('KeyS')) b |= Buttons.Back;
    if (this.isDown('KeyA')) b |= Buttons.Left;
    if (this.isDown('KeyD')) b |= Buttons.Right;
    if (this.stance === 'crouch') b |= Buttons.Crouch;
    if (this.stance === 'prone') b |= Buttons.Prone;
    if (this.isDown('KeyC')) b |= Buttons.Descend;
    if (this.isDown('Space') && !this.jumpBlocked) b |= Buttons.Jump;
    if (this.isDown('ShiftLeft') || this.isDown('ShiftRight')) b |= Buttons.Sprint;
    if (this.aiming) b |= Buttons.Aim;
    if (this.mouseHeld) b |= Buttons.Fire;
    return b;
  }
}
