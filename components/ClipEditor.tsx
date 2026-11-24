'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { audioCtx, getBuffer, peaks, playSample } from '@/lib/audio';
import { COLORS, PAD_COUNT, type Sample, type Source } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';

const BINS = 600;

export default function ClipEditor({ s, source, sample, onDone }: { s: Studio; source: Source; sample?: Sample; onDone: () => void }) {
  const buf = getBuffer(source.id);
  const dur = buf?.duration ?? 0;
  const [start, setStart] = useState(sample?.start ?? 0);
  const [end, setEnd] = useState(sample?.end ?? Math.min(dur, 2));
  const [name, setName] = useState(sample?.name ?? `${source.name} ${s.samples.filter((x) => x.sourceId === source.id).length + 1}`);
  const [gain, setGain] = useState(sample?.gain ?? 1);
  const [color, setColor] = useState(sample?.color ?? COLORS[s.samples.length % COLORS.length]);
  const [pad, setPad] = useState<number | null>(sample ? s.pads.indexOf(sample.id) : s.pads.indexOf(null));
  const [head, setHead] = useState<number | null>(null);

  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const drag = useRef<'start' | 'end' | null>(null);
  const preview = useRef<{ node: AudioBufferSourceNode | null; raf: number }>({ node: null, raf: 0 });

  const pk = useMemo(() => (buf ? peaks(buf, BINS) : null), [buf]);
  const url = useMemo(() => (source.kind === 'video' ? URL.createObjectURL(source.blob) : ''), [source]);
  useEffect(() => () => { url && URL.revokeObjectURL(url); stopPreview(); }, [url]);

  // draw waveform
  useEffect(() => {
    const c = canvas.current;
    if (!c || !pk) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const g = c.getContext('2d')!;
    const w = c.width / BINS, mid = c.height / 2, max = Math.max(...pk) || 1;
    g.clearRect(0, 0, c.width, c.height);
    pk.forEach((v, i) => {
      const t = (i / BINS) * dur;
      g.fillStyle = t >= start && t <= end ? color : '#3f3f46';
      const h = Math.max(1, (v / max) * mid * 0.95);
      g.fillRect(i * w, mid - h, Math.max(1, w - 0.5), h * 2);
    });
  }, [pk, start, end, color, dur]);

  useEffect(() => { if (video.current) video.current.currentTime = start; }, [start]);

  const toTime = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur));
  };

  const onDown = (e: React.PointerEvent) => {
    const t = toTime(e.clientX);
    drag.current = Math.abs(t - start) < Math.abs(t - end) ? 'start' : 'end';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onMove(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const t = toTime(e.clientX);
    if (drag.current === 'start') setStart(Math.min(t, end - 0.01));
    else setEnd(Math.max(t, start + 0.01));
  };

  function stopPreview() {
    try { preview.current.node?.stop(); } catch {}
    cancelAnimationFrame(preview.current.raf);
    video.current?.pause();
    setHead(null);
  }

  function playPreview() {
    stopPreview();
    const node = playSample({ id: '_', sourceId: source.id, name, start, end, color, gain });
    if (!node) return;
    const t0 = audioCtx().currentTime;
    if (video.current) { video.current.currentTime = start; video.current.play().catch(() => {}); }
    const tick = () => {
      const p = start + (audioCtx().currentTime - t0);
      if (p >= end) return stopPreview();
      setHead(p);
      preview.current.raf = requestAnimationFrame(tick);
    };
    preview.current = { node, raf: requestAnimationFrame(tick) };
  }

  const nudge = (which: 'start' | 'end', d: number) =>
    which === 'start' ? setStart((v) => Math.max(0, Math.min(end - 0.01, v + d))) : setEnd((v) => Math.min(dur, Math.max(start + 0.01, v + d)));

  async function save(asNew = false) {
    stopPreview();
    await s.saveSample({ id: asNew ? undefined : sample?.id, sourceId: source.id, name: name.trim() || 'Sample', start, end, gain, color }, pad !== null && pad >= 0 ? pad : null);
    onDone();
  }

  if (!buf) return <p className="text-sm text-zinc-400">Decoding audio…</p>;

  const pct = (t: number) => `${(t / dur) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      {source.kind === 'video' && (
        <video ref={video} src={url} muted playsInline className="w-full max-h-48 rounded-xl bg-black object-contain" />
      )}

      {/* waveform + handles */}
      <div ref={wrap} className="relative h-28 rounded-xl bg-zinc-950 touch-none cursor-ew-resize"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <canvas ref={canvas} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-y-0 bg-black/50 left-0" style={{ width: pct(start) }} />
        <div className="absolute inset-y-0 bg-black/50 right-0" style={{ left: pct(end) }} />
        {[start, end].map((t, i) => (
          <div key={i} className="absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(t) }}>
            <div className={`absolute ${i ? 'bottom-0' : 'top-0'} -translate-x-1/2 size-4 rounded-full bg-white`} />
          </div>
        ))}
        {head !== null && <div className="absolute inset-y-0 w-px bg-yellow-300" style={{ left: pct(head) }} />}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {(['start', 'end'] as const).map((w) => (
          <div key={w} className="flex items-center justify-between bg-zinc-800/60 rounded-xl p-1.5">
            <button className="size-8 rounded-lg bg-zinc-800" onClick={() => nudge(w, -0.01)}>−</button>
            <span className="tabular-nums">{w} {(w === 'start' ? start : end).toFixed(2)}s</span>
            <button className="size-8 rounded-lg bg-zinc-800" onClick={() => nudge(w, 0.01)}>+</button>
          </div>
        ))}
      </div>

      <motion.button whileTap={{ scale: 0.96 }} onClick={head === null ? playPreview : stopPreview}
        className="h-11 rounded-xl bg-zinc-800 font-medium">
        {head === null ? `▶ Preview ${(end - start).toFixed(2)}s` : '■ Stop'}
      </motion.button>

      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sample name"
        className="h-11 px-3 rounded-xl bg-zinc-800 outline-none focus:ring-2 ring-white/20" />

      <label className="flex items-center gap-3 text-sm text-zinc-400">
        Volume
        <input type="range" min={0} max={2} step={0.05} value={gain} onChange={(e) => setGain(+e.target.value)} className="flex-1 accent-white" />
      </label>

      <div className="flex gap-2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} className={`size-7 rounded-full ${c === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`} style={{ background: c }} />
        ))}
      </div>

      <div>
        <p className="text-sm text-zinc-400 mb-2">Put on pad</p>
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: PAD_COUNT }, (_, i) => (
            <button key={i} onClick={() => setPad(pad === i ? null : i)}
              className={`aspect-square rounded-lg text-xs ${pad === i ? 'bg-white text-black' : s.pads[i] ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-800 text-zinc-500'}`}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {sample && <button onClick={() => save(true)} className="flex-1 h-12 rounded-xl bg-zinc-800 font-medium">Save as new</button>}
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => save()} className="flex-1 h-12 rounded-xl bg-white text-black font-semibold">
          {sample ? 'Update' : 'Save sample'}
        </motion.button>
      </div>
    </div>
  );
}
