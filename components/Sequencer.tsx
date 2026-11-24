'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { STEPS } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';
import { Tempo } from './PadGrid';

/** 16-step grid, one row per loaded pad. */
export default function Sequencer({ s }: { s: Studio }) {
  const [msg, setMsg] = useState('');
  const rows = s.pads.map((id, pad) => ({ pad, smp: id ? s.byId[id] : null })).filter((r) => r.smp);
  const playing = s.seqStep !== null;
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2200); };

  if (!rows.length)
    return (
      <div className="rounded-2xl border border-white/10 p-5 text-center">
        <p className="mb-3 text-zinc-400 text-sm">Put some sounds on pads first.</p>
        <button onClick={() => s.loadKit()} className="h-11 px-5 rounded-full bg-white text-black font-semibold">Load drum kit</button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => (playing ? s.stopSeq() : s.startSeq())}
          className={`h-11 px-5 rounded-full font-semibold ${playing ? 'bg-white text-black' : 'bg-rose-500 text-white'}`}>
          {playing ? '■ Stop' : '▶ Play'}
        </motion.button>
        <div className="flex-1" />
        <button onClick={() => s.setPattern({})} className="h-11 px-4 rounded-full bg-zinc-800 text-sm text-zinc-300">Clear</button>
        <button onClick={async () => toast((await s.patternToScene()) ? 'Saved to Scenes' : 'Pattern is empty')}
          className="h-11 px-4 rounded-full bg-zinc-800 text-sm text-zinc-300">Save</button>
      </div>
      <Tempo s={s} keys={false} />

      <div className="flex flex-col gap-1.5 select-none">
        {rows.map(({ pad, smp }) => (
          <div key={pad} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] truncate" style={{ color: smp!.color }}>{smp!.name}</span>
            <div className="flex-1 grid grid-cols-16 gap-[3px]" style={{ gridTemplateColumns: `repeat(${STEPS}, minmax(0, 1fr))` }}>
              {Array.from({ length: STEPS }, (_, st) => {
                const on = s.pattern[pad]?.[st];
                const now = s.seqStep === st;
                return (
                  <button key={st} onPointerDown={() => s.toggleStep(pad, st)}
                    className={`h-8 rounded-[5px] transition-transform ${now ? 'scale-y-110' : ''} ${st % 4 === 0 ? 'ml-0' : ''}`}
                    style={{
                      background: on ? smp!.color : st % 8 < 4 ? '#27272a' : '#1f1f23',
                      outline: now ? '1px solid #fff' : undefined,
                    }} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-500">Tap steps to toggle. Save turns the loop into a scene you can export as WAV.</p>
      {msg && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-full bg-white text-black text-sm px-4 py-2 shadow-lg">{msg}</div>}
    </div>
  );
}
