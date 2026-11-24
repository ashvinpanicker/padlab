'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from './db';
import { KIT, audioCtx, click, decodeSource, forgetBuffer, makeKitWav, playScene, playSample, startClock } from './audio';
import {
  COLORS, DEFAULT_SETTINGS, PAD_COUNT, STEPS, type Pattern, type Sample, type Scene, type SceneEvent, type Settings, type Source, uid,
} from './types';

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

  // tempo, sequencer, keys mode
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [pattern, setPatternState] = useState<Pattern>({});
  const [seqStep, setSeqStep] = useState<number | null>(null); // playing step, null = stopped
  const [keysPad, setKeysPad] = useState<number | null>(null); // pad whose sample is played chromatically
  const lastPad = useRef<number | null>(null);
  const clocks = useRef<{ rec?: () => void; seq?: () => void }>({});

  // the clock callback runs outside React renders, so it reads the latest state through refs
  const live = useRef({ pads, byId, pattern, settings });
  live.current = { pads, byId, pattern, settings };

  useEffect(() => {
    (async () => {
      const [src, smp, scn, p, st, pt] = await Promise.all([
        db.all<Source>('sources'), db.all<Sample>('samples'), db.all<Scene>('scenes'), db.get<(string | null)[]>('meta', 'pads'),
        db.get<Settings>('meta', 'settings'), db.get<Pattern>('meta', 'pattern'),
      ]);
      setSources(src); setSamples(smp); setScenes(scn.sort((a, b) => b.createdAt - a.createdAt));
      if (p) setPads(p);
      if (st) setSettingsState({ ...DEFAULT_SETTINGS, ...st });
      if (pt) setPatternState(pt);
      setReady(true);
      // decode lazily in background
      src.forEach((s) => decodeSource(s.id, s.blob).catch(() => {}));
    })();
  }, []);

  const savePads = (p: (string | null)[]) => { setPads(p); db.put('meta', 'pads', p); };

  const flash = (pad: number) => setHits((h) => h.map((v, i) => (i === pad ? v + 1 : v)));

  const setSettings = (p: Partial<Settings>) => setSettingsState((s) => { const n = { ...s, ...p }; db.put('meta', 'settings', n); return n; });
  const setPattern = (p: Pattern) => { setPatternState(p); db.put('meta', 'pattern', p); };
  const toggleStep = (pad: number, step: number) => {
    const row = [...(pattern[pad] ?? Array(STEPS).fill(false))];
    row[step] = !row[step];
    setPattern({ ...pattern, [pad]: row });
  };

  const hitPad = useCallback((pad: number) => {
    // keys mode: every pad plays the chosen sample, pad N = +N semitones
    const keySample = keysPad !== null && pads[keysPad] ? byId[pads[keysPad]!] : null;
    const id = keySample ? keySample.id : pads[pad];
    const s = id && byId[id];
    const semis = keySample ? pad : 0;
    flash(pad);
    if (!s) return;
    if (!keySample) lastPad.current = pad;
    playSample(s, 0, undefined, semis);
    if (recording) recEvents.current.push({ t: audioCtx().currentTime - recStart.current, sampleId: s.id, pad, ...(semis ? { semis } : {}) });
  }, [pads, byId, recording, keysPad]);

  /** Toggle keys mode using the last pad you hit. Returns false if nothing to play. */
  function toggleKeys() {
    if (keysPad !== null) return setKeysPad(null), true;
    const p = lastPad.current;
    if (p === null || !pads[p]) return false;
    setKeysPad(p);
    return true;
  }

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
    recStart.current = audioCtx().currentTime + 0.05;
    if (settings.click && !clocks.current.seq) clocks.current.rec = startClock(() => live.current.settings.bpm, (st, t) => st % 4 === 0 && click(t, st % 16 === 0), recStart.current);
    setRecording(true);
  }

  async function stopRec() {
    clocks.current.rec?.();
    setRecording(false);
    const events = recEvents.current;
    if (!events.length) return null;
    const end = audioCtx().currentTime - recStart.current;
    let evs = events, shift = events[0].t, duration = end - shift; // free timing: trim leading silence
    if (settings.snap) {
      // snap to 16ths, start on the bar of the first hit, round length up to whole bars so it loops tight
      const sixteenth = 60 / settings.bpm / 4, bar = sixteenth * STEPS;
      evs = events.map((e) => ({ ...e, t: Math.max(0, Math.round(e.t / sixteenth) * sixteenth) }));
      shift = Math.floor(evs[0].t / bar) * bar;
      duration = Math.max(1, Math.ceil((end - shift - sixteenth / 2) / bar)) * bar;
    }
    return saveScene(evs.map((e) => ({ ...e, t: e.t - shift })), duration);
  }

  async function saveScene(events: SceneEvent[], duration: number, name = `Scene ${scenes.length + 1}`) {
    const scene: Scene = { id: uid(), name, createdAt: Date.now(), duration, events };
    await db.put('scenes', scene.id, scene);
    setScenes((x) => [scene, ...x]);
    return scene;
  }

  // ---- step sequencer ----
  function startSeq() {
    stopScene();
    clocks.current.seq?.();
    const c = audioCtx();
    clocks.current.seq = startClock(() => live.current.settings.bpm, (n, t) => {
      const st = n % STEPS, { pads: p, byId: b, pattern: pt, settings: cfg } = live.current;
      if (cfg.click && st % 4 === 0) click(t, st === 0);
      for (const [pad, row] of Object.entries(pt)) {
        const smp = row[st] && p[+pad] ? b[p[+pad]!] : null;
        if (smp) playSample(smp, t);
      }
      const ms = Math.max(0, (t - c.currentTime) * 1000);
      window.setTimeout(() => {
        setSeqStep(st);
        for (const [pad, row] of Object.entries(live.current.pattern)) if (row[st]) flash(+pad);
      }, ms);
    });
    setSeqStep(0);
  }
  function stopSeq() { clocks.current.seq?.(); clocks.current.seq = undefined; setSeqStep(null); }
  useEffect(() => () => { clocks.current.seq?.(); clocks.current.rec?.(); }, []);

  /** Freeze the pattern into a 1-bar scene (loops in Scenes, exports to WAV). */
  function patternToScene() {
    const sixteenth = 60 / settings.bpm / 4, events: SceneEvent[] = [];
    for (let st = 0; st < STEPS; st++)
      for (const [pad, row] of Object.entries(pattern)) {
        const id = row[st] ? pads[+pad] : null;
        if (id) events.push({ t: st * sixteenth, sampleId: id, pad: +pad });
      }
    return events.length ? saveScene(events, sixteenth * STEPS, `Beat ${scenes.length + 1}`) : null;
  }

  // ---- built-in drum kit ----
  async function loadKit() {
    const { blob, hits } = await makeKitWav();
    const src: Source = { id: uid(), name: 'Drum kit', blob, kind: 'audio' };
    await decodeSource(src.id, blob);
    await db.put('sources', src.id, src);
    const made: Sample[] = hits.map((h, i) => ({
      id: uid(), sourceId: src.id, name: h.name, start: h.start, end: h.end, gain: 1, color: COLORS[i % COLORS.length],
      ...(h.name.includes('hat') || h.name === 'Hat' ? { fx: { choke: true } } : {}),
    }));
    await Promise.all(made.map((m) => db.put('samples', m.id, m)));
    // fill empty pads, in kit order
    const next = [...pads];
    let k = 0;
    for (let i = 0; i < next.length && k < made.length; i++) if (!next[i]) next[i] = made[k++].id;
    setSources((x) => [...x, src]);
    setSamples((x) => [...x, ...made]);
    savePads(next);
    return KIT.length;
  }

  function stopScene() {
    cancel.current?.();
    cancel.current = null;
    setPlayingId(null);
  }

  function startScene(scene: Scene, loop = false) {
    stopScene();
    stopSeq();
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
    settings, pattern, seqStep, keysPad,
    hitPad, addSource, removeSource, saveSample, removeSample, assignPad,
    startRec, stopRec, startScene, stopScene, updateScene, removeScene,
    setSettings, toggleStep, setPattern, startSeq, stopSeq, patternToScene, toggleKeys, loadKit,
  };
}

export type Studio = ReturnType<typeof useStudio>;
