/** Flip ticks, synthesised so there are no sound files to load. */
const MUTE_KEY = 'write-on:muted';
let ctx: AudioContext | null = null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = readMuted();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* storage may be blocked; muting still works for this visit */
  }
}

/** A short tick. `home` is the lower one: back on the original variant. */
export function tick(home: boolean): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(home ? 620 : 1320, now);
    osc.frequency.exponentialRampToValueAtTime(home ? 420 : 980, now + 0.05);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    /* no audio available */
  }
}
