'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from './db';
import { audioCtx, decodeSource, forgetBuffer, playScene, playSample } from './audio';
import { COLORS, PAD_COUNT, type Sample, type Scene, type SceneEvent, type Source, uid } from './types';

export function useStudio() {
  const [sources, setSources] = useState<Source[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [pads, setPads] = useState<(string | null)[]>(Array(PAD_COUNT).fill(null));
  const [ready, setReady] = useState(false);
  const [hits, setHits] = useState<number[]>(Array(PAD_COUNT).fill(0));

  // recording
  const [recording, setRecording] = useState(false);
  const recStart = useRef(0);
  const recEvents = useRef<SceneEvent[]>([]);

  // scene playback
  const [playingId, setPlayingId] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const byId = useMemo(() => Object.fromEntries(samples.map((s) => [s.id, s])), [samples]);

  useEffect(() => {
    (async () => {
      const [src, smp, scn, p] = await Promise.all([
        db.all<Source>('sources'), db.all<Sample>('samples'), db.all<Scene>('scenes'), db.get<(string | null)[]>('meta', 'pads'),
      ]);
      setSources(src); setSamples(smp); setScenes(scn.sort((a, b) => b.createdAt - a.createdAt));
      if (p) setPads(p);
      setReady(true);
      // decode lazily in background
      src.forEach((s) => decodeSource(s.id, s.blob).catch(() => {}));
    })();
  }, []);

  const savePads = (p: (string | null)[]) => { setPads(p); db.put('meta', 'pads', p); };

  const flash = (pad: number) => setHits((h) => h.map((v, i) => (i === pad ? v + 1 : v)));

  const hitPad = useCallback((pad: number) => {
    const id = pads[pad];
    const s = id && byId[id];
    flash(pad);
    if (!s) return;
    playSample(s);
    if (recording) recEvents.current.push({ t: audioCtx().currentTime - recStart.current, sampleId: s.id, pad });
  }, [pads, byId, recording]);

  async function addSource(file: File) {
    const src: Source = { id: uid(), name: file.name.replace(/\.[^.]+$/, ''), blob: file, kind: file.type.startsWith('video') ? 'video' : 'audio' };
    await decodeSource(src.id, file); // throws if the browser can't read the audio
    await db.put('sources', src.id, src);
    setSources((x) => [...x, src]);
    return src;
  }

  async function removeSource(id: string) {
    const dead = samples.filter((s) => s.sourceId === id).map((s) => s.id);
    await Promise.all([db.del('sources', id), ...dead.map((d) => db.del('samples', d))]);
    forgetBuffer(id);
    setSources((x) => x.filter((s) => s.id !== id));
    setSamples((x) => x.filter((s) => s.sourceId !== id));
    savePads(pads.map((p) => (p && dead.includes(p) ? null : p)));
  }

  async function saveSample(s: Omit<Sample, 'id' | 'color'> & { id?: string; color?: string }, pad: number | null) {
    const full: Sample = { color: COLORS[samples.length % COLORS.length], ...s, id: s.id ?? uid() } as Sample;
    await db.put('samples', full.id, full);
    setSamples((x) => [...x.filter((y) => y.id !== full.id), full]);
    if (pad !== null) savePads(pads.map((p, i) => (i === pad ? full.id : p)));
    return full;
  }

  async function removeSample(id: string) {
    await db.del('samples', id);
    setSamples((x) => x.filter((s) => s.id !== id));
    savePads(pads.map((p) => (p === id ? null : p)));
  }

  const assignPad = (pad: number, sampleId: string | null) => savePads(pads.map((p, i) => (i === pad ? sampleId : p)));

  function startRec() {
    stopScene();
    recEvents.current = [];
    recStart.current = audioCtx().currentTime;
    setRecording(true);
  }

  async function stopRec() {
    setRecording(false);
    const events = recEvents.current;
    if (!events.length) return null;
    const shift = events[0].t; // trim leading silence
    const scene: Scene = {
      id: uid(),
      name: `Scene ${scenes.length + 1}`,
      createdAt: Date.now(),
      duration: audioCtx().currentTime - recStart.current - shift,
      events: events.map((e) => ({ ...e, t: e.t - shift })),
    };
    await db.put('scenes', scene.id, scene);
    setScenes((x) => [scene, ...x]);
    return scene;
  }

  function stopScene() {
    cancel.current?.();
    cancel.current = null;
    setPlayingId(null);
  }

  function startScene(scene: Scene, loop = false) {
    stopScene();
    setPlayingId(scene.id);
    let timer = 0;
    let inner = () => {};
    const run = () => {
      inner = playScene(scene, byId, flash);
      timer = window.setTimeout(() => (loop ? run() : setPlayingId(null)), Math.max(0.25, scene.duration) * 1000);
    };
    run();
    cancel.current = () => { clearTimeout(timer); inner(); };
  }

  async function updateScene(scene: Scene) {
    await db.put('scenes', scene.id, scene);
    setScenes((x) => x.map((s) => (s.id === scene.id ? scene : s)));
  }

  async function removeScene(id: string) {
    if (playingId === id) stopScene();
    await db.del('scenes', id);
    setScenes((x) => x.filter((s) => s.id !== id));
  }

  return {
    ready, sources, samples, scenes, pads, hits, byId, recording, playingId,
    hitPad, addSource, removeSource, saveSample, removeSample, assignPad,
    startRec, stopRec, startScene, stopScene, updateScene, removeScene,
  };
}

export type Studio = ReturnType<typeof useStudio>;
