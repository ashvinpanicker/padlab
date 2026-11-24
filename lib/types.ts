export type Source = { id: string; name: string; blob: Blob; kind: 'audio' | 'video' };

export type Sample = {
  id: string;
  sourceId: string;
  name: string;
  start: number; // seconds into source
  end: number;
  color: string;
  gain: number;
  fx?: Partial<Fx>; // older samples have none → defaults
};

export type Fx = {
  semis: number; // transpose, -24..24 (changes speed too, like a classic sampler)
  cents: number; // fine tune, -100..100
  reverse: boolean;
  filter: 'off' | 'lowpass' | 'highpass';
  cutoff: number; // Hz
  q: number;
  drive: number; // 0..1
  pan: number; // -1..1
  attack: number; // seconds
  release: number; // seconds
  delay: number; // send 0..1
  delayTime: number; // seconds
  reverb: number; // send 0..1
  choke: boolean; // a new hit cuts the previous one (hats, vocals)
};

export const DEFAULT_FX: Fx = {
  semis: 0, cents: 0, reverse: false, filter: 'off', cutoff: 2000, q: 1, drive: 0, pan: 0,
  attack: 0.002, release: 0.01, delay: 0, delayTime: 0.25, reverb: 0, choke: false,
};

export const fxOf = (s: { fx?: Partial<Fx> }): Fx => ({ ...DEFAULT_FX, ...s.fx });

export type SceneEvent = { t: number; sampleId: string; pad: number; semis?: number }; // semis: keys mode

export type Scene = {
  id: string;
  name: string;
  createdAt: number;
  duration: number;
  events: SceneEvent[];
};

export const PAD_COUNT = 16;

export const COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];

export const PAD_KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const STEPS = 16;
export type Pattern = Record<number, boolean[]>; // pad index -> 16 steps
export type Settings = { bpm: number; click: boolean; snap: boolean };
export const DEFAULT_SETTINGS: Settings = { bpm: 90, click: true, snap: true };
