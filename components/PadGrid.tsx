'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { PAD_KEYS } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';
import Sheet from './Sheet';

export default function PadGrid({ s }: { s: Studio }) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  // Desktop keyboard: 1234 / qwer / asdf / zxcv
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement).closest('input,textarea')) return;
      const i = PAD_KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0) s.hitPad(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.hitPad]);

  return (
    <div className="flex flex-col gap-4">
      <Transport s={s} editing={editing} setEditing={setEditing} />

      <div className="grid grid-cols-4 gap-2 sm:gap-3 select-none touch-none">
        {s.pads.map((id, i) => {
          const smp = id ? s.byId[id] : null;
          return (
            <motion.button
              key={i}
              onPointerDown={(e) => {
                e.preventDefault();
                editing ? setPicking(i) : s.hitPad(i);
              }}
              whileTap={{ scale: 0.92 }}
              className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 text-left p-2 shadow-[inset_0_-4px_0_rgba(0,0,0,.4)]"
              style={{ borderColor: smp ? smp.color + '88' : undefined }}
            >
              {/* hit flash */}
              <motion.span
                key={s.hits[i]}
                initial={{ opacity: s.hits[i] ? 0.9 : 0 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0"
                style={{ background: smp?.color ?? '#fff' }}
              />
              <span className="absolute top-1.5 right-2 text-[10px] text-zinc-500 uppercase hidden sm:block">{PAD_KEYS[i]}</span>
              <span className="absolute bottom-1.5 left-2 right-2 text-[10px] sm:text-xs font-medium truncate" style={{ color: smp?.color ?? '#52525b' }}>
                {smp ? smp.name : editing ? '+ assign' : ''}
              </span>
              {editing && <span className="absolute inset-0 border-2 border-dashed border-white/20 rounded-2xl" />}
            </motion.button>
          );
        })}
      </div>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title={`Pad ${picking !== null ? picking + 1 : ''}`}>
        {s.samples.length === 0 && <p className="text-sm text-zinc-400">No samples yet. Go to Samples, upload a file and clip it.</p>}
        <div className="flex flex-col gap-1">
          {s.samples.map((smp) => (
            <button key={smp.id} onClick={() => { s.assignPad(picking!, smp.id); setPicking(null); }}
              className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-left">
              <span className="size-3 rounded-full" style={{ background: smp.color }} />
              <span className="flex-1 truncate">{smp.name}</span>
              <span className="text-xs text-zinc-500">{(smp.end - smp.start).toFixed(2)}s</span>
            </button>
          ))}
          {picking !== null && s.pads[picking] && (
            <button onClick={() => { s.assignPad(picking, null); setPicking(null); }} className="p-3 text-sm text-rose-400">Clear pad</button>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function Transport({ s, editing, setEditing }: { s: Studio; editing: boolean; setEditing: (v: boolean) => void }) {
  const [t, setT] = useState(0);
  const [msg, setMsg] = useState('');
  const toggle = async () => {
    if (!s.recording) return s.startRec();
    const sc = await s.stopRec();
    setMsg(sc ? `Saved “${sc.name}” → Scenes` : 'Nothing recorded — hit some pads');
    setTimeout(() => setMsg(''), 2200);
  };
  useEffect(() => {
    if (!s.recording) return setT(0);
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, [s.recording]);

  return (
    <div className="flex items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={toggle}
        className={`flex items-center gap-2 h-11 px-4 rounded-full font-semibold ${s.recording ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-rose-400'}`}
      >
        <motion.span
          className="size-3 rounded-full bg-current"
          animate={s.recording ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
        {s.recording ? `Stop · ${t.toFixed(1)}s` : 'Record scene'}
      </motion.button>
      <div className="flex-1" />
      <button onClick={() => setEditing(!editing)}
        className={`h-11 px-4 rounded-full text-sm ${editing ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300'}`}>
        {editing ? 'Done' : 'Assign'}
      </button>
      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-full bg-white text-black text-sm px-4 py-2 shadow-lg whitespace-nowrap">
            {msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
