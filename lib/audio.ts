import { fxOf, type Sample, type Scene } from './types';

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>(); // sourceId -> decoded audio

export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export async function decodeSource(id: string, blob: Blob) {
  if (buffers.has(id)) return buffers.get(id)!;
  let buf: AudioBuffer;
  try {
    buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
  } catch {
    buf = await demuxDecode(blob); // .mov and other containers the browser's quick path rejects
  }
  buffers.set(id, buf);
  return buf;
}

/** Fallback: demux with mediabunny (MOV/MP4/MKV/WebM…) and decode via WebCodecs. Loaded only when needed. */
async function demuxDecode(blob: Blob) {
  const { Input, BlobSource, ALL_FORMATS, AudioBufferSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const tracks = await input.getAudioTracks();
  if (!tracks.length) throw new Error('This file has no audio track.');
  // iPhone spatial-audio videos can carry an undecodable track next to a normal AAC one — take the first that works
  let track = null;
  for (const t of tracks) if (await t.canDecode()) { track = t; break; }
  if (!track) throw new Error(`This browser can't decode ${tracks[0].codec ?? 'this'} audio.`);
  const parts: AudioBuffer[] = [];
  for await (const { buffer } of new AudioBufferSink(track).buffers()) parts.push(buffer);
  if (!parts.length) throw new Error('No audio found in this file.');
  const { sampleRate, numberOfChannels } = parts[0];
  const out = audioCtx().createBuffer(numberOfChannels, parts.reduce((n, p) => n + p.length, 0), sampleRate);
  for (let c = 0, o = 0; c < numberOfChannels; c++, o = 0)
    for (const p of parts) { out.getChannelData(c).set(p.getChannelData(Math.min(c, p.numberOfChannels - 1)), o); o += p.length; }
  return out;
}

export const getBuffer = (sourceId: string) => buffers.get(sourceId);
export const forgetBuffer = (sourceId: string) => buffers.delete(sourceId);

type Voice = { src: AudioBufferSourceNode; out: AudioNode[] };
const active = new Set<Voice>();
const lastVoice = new Map<string, Voice>(); // for choke
const reversed = new Map<string, AudioBuffer>();
const reverbs = new WeakMap<BaseAudioContext, ConvolverNode>();

/** Reversed copy of just the clipped region (cached). */
function reversedSlice(s: Sample, buf: AudioBuffer) {
  const key = `${s.sourceId}:${s.start}:${s.end}`;
  if (!reversed.has(key)) {
    const a = Math.floor(s.start * buf.sampleRate), b = Math.floor(s.end * buf.sampleRate);
    const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: Math.max(1, b - a), sampleRate: buf.sampleRate });
    for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).slice(a, b).reverse());
    reversed.set(key, out);
  }
  return reversed.get(key)!;
}

/** One shared reverb per context, generated impulse (no asset files). */
function reverbBus(c: BaseAudioContext) {
  if (!reverbs.has(c)) {
    const len = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    conv.connect(c.destination);
    reverbs.set(c, conv);
  }
  return reverbs.get(c)!;
}

const driveCurve = (amt: number) => {
  const k = amt * 60, n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return curve;
};

/** Real-time length of a sample after transpose. */
export const voiceLength = (s: Sample, extraSemis = 0) => {
  const f = fxOf(s);
  return Math.max(0.01, s.end - s.start) / Math.pow(2, (f.semis + extraSemis) / 12 + f.cents / 1200);
};

/** Play a sample now (or at `when`) through its effect chain. */
export function playSample(s: Sample, when = 0, c: BaseAudioContext = audioCtx(), extraSemis = 0) {
  const buf = buffers.get(s.sourceId);
  if (!buf) return null;
  const f = fxOf(s);
  const t = when || c.currentTime;
  const dur = voiceLength(s, extraSemis);

  const src = c.createBufferSource();
  src.playbackRate.value = Math.pow(2, (f.semis + extraSemis) / 12 + f.cents / 1200);
  let node: AudioNode = src;
  const chain = (n: AudioNode) => { node.connect(n); node = n; };

  if (f.filter !== 'off') {
    const bq = c.createBiquadFilter();
    bq.type = f.filter; bq.frequency.value = f.cutoff; bq.Q.value = f.q;
    chain(bq);
  }
  if (f.drive > 0) {
    const ws = c.createWaveShaper();
    ws.curve = driveCurve(f.drive); ws.oversample = '2x';
    chain(ws);
  }
  // volume envelope (fade in/out) — kills clicks at clip edges
  const env = c.createGain();
  const a = Math.min(f.attack, dur / 2), r = Math.min(f.release, dur / 2), peak = s.gain * (f.drive > 0 ? 1 / (1 + f.drive) : 1);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + a);
  env.gain.setValueAtTime(peak, t + dur - r);
  env.gain.linearRampToValueAtTime(0, t + dur);
  chain(env);
  const pan = c.createStereoPanner();
  pan.pan.value = f.pan;
  chain(pan);
  pan.connect(c.destination);
  const outs: AudioNode[] = [pan];

  if (f.delay > 0) {
    const send = c.createGain(), dl = c.createDelay(2), fb = c.createGain();
    send.gain.value = f.delay; dl.delayTime.value = f.delayTime; fb.gain.value = 0.4;
    pan.connect(send).connect(dl).connect(c.destination);
    dl.connect(fb).connect(dl);
    outs.push(send);
  }
  if (f.reverb > 0) {
    const send = c.createGain();
    send.gain.value = f.reverb;
    pan.connect(send).connect(reverbBus(c));
    outs.push(send);
  }

  if (f.reverse) { src.buffer = reversedSlice(s, buf); src.start(t); }
  else { src.buffer = buf; src.start(t, s.start, Math.max(0.01, s.end - s.start)); }

  if (c === ctx) {
    const v = { src, out: outs };
    const prev = f.choke && lastVoice.get(s.id);
    if (prev) { try { prev.src.stop(t); } catch {} }
    lastVoice.set(s.id, v);
    active.add(v);
    src.onended = () => setTimeout(() => active.delete(v), 3000); // keep tails stoppable a bit
  }
  return src;
}

export function stopAll() {
  active.forEach((v) => {
    try { v.src.stop(); } catch {}
    v.out.forEach((o) => o.disconnect()); // cut delay/reverb tails too
  });
  active.clear();
}

/** Schedule a whole scene from now. Returns a cancel fn. */
export function playScene(scene: Scene, samples: Record<string, Sample>, onPad?: (pad: number) => void) {
  const c = audioCtx();
  const t0 = c.currentTime + 0.05;
  const nodes = scene.events.map((e) => {
    const s = samples[e.sampleId];
    return s ? playSample(s, t0 + e.t, c, e.semis) : null;
  });
  const timers = onPad ? scene.events.map((e) => window.setTimeout(() => onPad(e.pad), e.t * 1000 + 50)) : [];
  return () => {
    timers.forEach(clearTimeout);
    nodes.forEach((n) => { try { n?.stop(); } catch {} });
  };
}

/** Render a scene offline and return a WAV blob. */
export async function renderSceneWav(scene: Scene, samples: Record<string, Sample>) {
  const rate = 44100;
  const tail = Math.max(0, ...scene.events.map((e) => {
    const s = samples[e.sampleId];
    if (!s) return 0;
    const f = fxOf(s);
    return e.t + voiceLength(s, e.semis) + (f.delay || f.reverb ? 2.5 : 0); // let echoes/reverb ring out
  }));
  const len = Math.ceil(Math.max(scene.duration, tail) * rate) + rate / 10;
  const off = new OfflineAudioContext(2, len, rate);
  scene.events.forEach((e) => samples[e.sampleId] && playSample(samples[e.sampleId], e.t || 0.0001, off, e.semis));
  return toWav(await off.startRendering());
}

export function toWav(buf: AudioBuffer) {
  const ch = buf.numberOfChannels, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++, o += 2) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  return new Blob([out], { type: 'audio/wav' });
}

/** Downsampled peaks for drawing a waveform. */
export function peaks(buf: AudioBuffer, bins: number) {
  const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / bins)), out = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    let m = 0;
    for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 8) m = Math.max(m, Math.abs(d[j]));
    out[i] = m;
  }
  return out;
}

/** Metronome blip. */
export function click(when: number, accent: boolean) {
  const c = audioCtx(), o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0.25, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  o.connect(g).connect(c.destination);
  o.start(when); o.stop(when + 0.05);
}

/** Look-ahead 16th-note clock. cb gets (step, audioTime). Returns stop fn. */
export function startClock(getBpm: () => number, cb: (step: number, time: number) => void, startAt?: number) {
  const c = audioCtx();
  let next = startAt ?? c.currentTime + 0.05, step = 0;
  const id = window.setInterval(() => {
    while (next < c.currentTime + 0.12) {
      cb(step, next);
      next += 60 / getBpm() / 4;
      step++;
    }
  }, 25);
  return () => clearInterval(id);
}

/** Synthesize a basic drum kit into one WAV (no sample files / licensing). Hits sit 0.5s apart. */
export const KIT = ['Kick', 'Snare', 'Clap', 'Hat', 'Open hat', 'Tom', 'Rim', 'Cowbell'];
export async function makeKitWav() {
  const sr = 44100, gap = 0.5, c = new OfflineAudioContext(1, sr * gap * KIT.length, sr);
  const noise = c.createBuffer(1, sr, sr);
  noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  const env = (t: number, peak: number, decay: number) => {
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    g.connect(c.destination);
    return g;
  };
  const osc = (type: OscillatorType, t: number, f0: number, f1: number, fall: number, out: AudioNode) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + fall);
    o.connect(out); o.start(t); o.stop(t + gap - 0.01);
  };
  const hiss = (t: number, type: BiquadFilterType, f: number, out: AudioNode, len = gap - 0.01) => {
    const n = c.createBufferSource(), bq = c.createBiquadFilter();
    n.buffer = noise; bq.type = type; bq.frequency.value = f;
    n.connect(bq).connect(out); n.start(t); n.stop(t + len);
  };
  const T = (i: number) => i * gap;
  osc('sine', T(0), 150, 45, 0.12, env(T(0), 1, 0.45));                       // kick
  hiss(T(1), 'highpass', 1200, env(T(1), 0.7, 0.2)); osc('triangle', T(1), 200, 160, 0.05, env(T(1), 0.5, 0.1)); // snare
  for (const d of [0, 0.012, 0.024]) hiss(T(2) + d, 'bandpass', 1500, env(T(2) + d, 0.9, d === 0.024 ? 0.2 : 0.01), 0.3); // clap
  hiss(T(3), 'highpass', 7000, env(T(3), 0.5, 0.05));                          // closed hat
  hiss(T(4), 'highpass', 7000, env(T(4), 0.45, 0.4));                          // open hat
  osc('sine', T(5), 220, 110, 0.25, env(T(5), 0.8, 0.35));                     // tom
  osc('square', T(6), 1700, 1600, 0.02, env(T(6), 0.25, 0.03));                // rim
  const bell = c.createBiquadFilter(); bell.type = 'bandpass'; bell.frequency.value = 800; bell.connect(env(T(7), 0.5, 0.3));
  osc('square', T(7), 540, 540, 0.01, bell); osc('square', T(7), 800, 800, 0.01, bell); // cowbell
  const out = await c.startRendering();
  return { blob: toWav(out), hits: KIT.map((name, i) => ({ name, start: i * gap, end: i * gap + gap - 0.02 })) };
}
