import type { Sample, Scene } from './types';

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

const active = new Set<AudioBufferSourceNode>();

/** Play a sample now (or at `when`). Returns the node so callers can stop it. */
export function playSample(s: Sample, when = 0, c: BaseAudioContext = audioCtx()) {
  const buf = buffers.get(s.sourceId);
  if (!buf) return null;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  g.gain.value = s.gain;
  src.connect(g).connect(c.destination);
  src.start(when || c.currentTime, s.start, Math.max(0.01, s.end - s.start));
  if (c === ctx) {
    active.add(src);
    src.onended = () => active.delete(src);
  }
  return src;
}

export function stopAll() {
  active.forEach((n) => {
    try { n.stop(); } catch {}
  });
  active.clear();
}

/** Schedule a whole scene from now. Returns a cancel fn. */
export function playScene(scene: Scene, samples: Record<string, Sample>, onPad?: (pad: number) => void) {
  const c = audioCtx();
  const t0 = c.currentTime + 0.05;
  const nodes = scene.events.map((e) => {
    const s = samples[e.sampleId];
    return s ? playSample(s, t0 + e.t) : null;
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
  const tail = Math.max(0, ...scene.events.map((e) => (samples[e.sampleId] ? e.t + samples[e.sampleId].end - samples[e.sampleId].start : 0)));
  const len = Math.ceil(Math.max(scene.duration, tail) * rate) + rate / 10;
  const off = new OfflineAudioContext(2, len, rate);
  scene.events.forEach((e) => samples[e.sampleId] && playSample(samples[e.sampleId], e.t || 0.0001, off));
  return toWav(await off.startRendering());
}

function toWav(buf: AudioBuffer) {
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
