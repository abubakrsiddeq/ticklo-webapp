// SCN-05: sound + vibration so volunteers notice the result in a noisy crowd.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", volume = 0.25) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, a.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + duration + 0.02);
}

/** Call once from a user tap so iOS allows audio later. */
export function unlockAudio() {
  tone(1, 0, 0.01, "sine", 0.0001);
}

export function successFeedback() {
  tone(880, 0, 0.12);
  tone(1320, 0.14, 0.18);
  navigator.vibrate?.(120);
}

export function failureFeedback() {
  tone(220, 0, 0.45, "square", 0.2);
  navigator.vibrate?.([300, 100, 300]);
}
