export type Source = { id: string; name: string; blob: Blob; kind: 'audio' | 'video' };

export type Sample = {
  id: string;
  sourceId: string;
  name: string;
  start: number; // seconds into source
  end: number;
  color: string;
  gain: number;
};

export type SceneEvent = { t: number; sampleId: string; pad: number };

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
