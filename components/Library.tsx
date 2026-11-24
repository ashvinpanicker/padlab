'use client';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { playSample } from '@/lib/audio';
import type { Sample, Source } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';
import ClipEditor from './ClipEditor';
import Sheet from './Sheet';

export default function Library({ s }: { s: Studio }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<{ source: Source; sample?: Sample } | null>(null);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []); // copy: clearing the input empties the live FileList
    if (!files.length) return;
    setBusy(true); setErr('');
    let last: Source | null = null;
    for (const f of files) {
      try { last = await s.addSource(f); } catch (e) { setErr(`Couldn't read "${f.name}": ${(e as Error)?.message || 'unsupported format'}`); }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (last && files.length === 1) setEdit({ source: last }); // jump straight into clipping
  }

  return (
    <div className="flex flex-col gap-6">
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => input.current?.click()}
        className="h-28 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-zinc-300">
        <span className="text-2xl">＋</span>
        <span className="text-sm">{busy ? 'Loading…' : 'Upload audio or video'}</span>
      </motion.button>
      <input ref={input} type="file" accept="audio/*,video/*,.mov,.m4a,.mp4" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {err && <p className="text-sm text-rose-400 -mt-4">{err}</p>}

      <Section title="Sources" hint="Tap to clip a new sample">
        {s.sources.map((src) => (
          <Row key={src.id} onClick={() => setEdit({ source: src })}
            left={<span className="text-lg">{src.kind === 'video' ? '🎬' : '🎵'}</span>}
            label={src.name}
            sub={`${s.samples.filter((x) => x.sourceId === src.id).length} samples`}
            onDelete={() => s.removeSource(src.id)} />
        ))}
      </Section>

      <Section title="Samples" hint="Tap to play · ✎ to re-clip">
        {s.samples.map((smp) => {
          const src = s.sources.find((x) => x.id === smp.sourceId)!;
          const pad = s.pads.indexOf(smp.id);
          return (
            <Row key={smp.id} onClick={() => playSample(smp)}
              left={<span className="size-3 rounded-full" style={{ background: smp.color }} />}
              label={smp.name}
              sub={`${(smp.end - smp.start).toFixed(2)}s${pad >= 0 ? ` · pad ${pad + 1}` : ''}`}
              onEdit={() => src && setEdit({ source: src, sample: smp })}
              onDelete={() => s.removeSample(smp.id)} />
          );
        })}
      </Section>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.sample ? 'Edit sample' : 'Clip a sample'}>
        {edit && <ClipEditor key={edit.sample?.id ?? edit.source.id} s={s} source={edit.source} sample={edit.sample} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode[] }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-semibold">{title}</h2>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      {children.length ? <div className="flex flex-col gap-1.5">{children}</div> : <p className="text-sm text-zinc-500">Nothing here yet.</p>}
    </section>
  );
}

export function Row({ left, label, sub, onClick, onEdit, onDelete, extra }: {
  left?: React.ReactNode; label: string; sub?: string; onClick?: () => void; onEdit?: () => void; onDelete?: () => void; extra?: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false); // tap ✕ twice to delete
  return (
    <motion.div layout className="flex items-center gap-2 rounded-xl bg-zinc-900 border border-white/5 pr-1.5">
      <button onClick={onClick} className="flex-1 flex items-center gap-3 p-3 text-left min-w-0">
        {left}
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {sub && <span className="block text-xs text-zinc-500">{sub}</span>}
        </span>
      </button>
      {extra}
      {onEdit && <button onClick={onEdit} className="size-9 rounded-lg bg-zinc-800 text-zinc-300">✎</button>}
      {onDelete && (
        <button onClick={() => (armed ? onDelete() : (setArmed(true), setTimeout(() => setArmed(false), 2500)))}
          className={`h-9 rounded-lg text-xs ${armed ? 'px-2.5 bg-rose-500 text-white' : 'w-9 bg-zinc-800 text-zinc-500'}`}>
          {armed ? 'Delete?' : '✕'}
        </button>
      )}
    </motion.div>
  );
}
