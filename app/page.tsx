'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStudio } from '@/lib/useStudio';
import { audioCtx, stopAll } from '@/lib/audio';
import PadGrid from '@/components/PadGrid';
import Library from '@/components/Library';
import Scenes from '@/components/Scenes';
import Sequencer from '@/components/Sequencer';

const TABS = [
  { id: 'pads', label: 'Pads', icon: '▦' },
  { id: 'beat', label: 'Beat', icon: '⋮⋮' },
  { id: 'samples', label: 'Samples', icon: '✂' },
  { id: 'scenes', label: 'Scenes', icon: '◉' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function Home() {
  const s = useStudio();
  const [tab, setTab] = useState<Tab>('pads');
  const playing = s.scenes.find((x) => x.id === s.playingId);

  return (
    // first touch anywhere unlocks audio on iOS/Android
    <main className="min-h-dvh flex flex-col" onPointerDownCapture={() => audioCtx()}>
      <header className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur border-b border-white/5 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-xl px-4 h-14 flex items-center gap-3">
          <span className="font-black tracking-tight text-lg">PAD<span className="text-rose-500">LAB</span></span>
          <div className="flex-1" />
          <AnimatePresence>
            {playing && (
              <motion.button initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                onClick={s.stopScene} className="h-8 px-3 rounded-full bg-white text-black text-xs font-medium truncate max-w-40">
                ■ {playing.name}
              </motion.button>
            )}
          </AnimatePresence>
          <button onClick={() => { stopAll(); s.stopScene(); }} className="h-8 px-3 rounded-full bg-zinc-800 text-xs text-zinc-300">Stop all</button>
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-xl px-4 pt-4 pb-28">
        {!s.ready ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {tab === 'pads' && (
                <>
                  {s.samples.length === 0 && (
                    <div className="mb-4 rounded-2xl bg-gradient-to-br from-rose-500/20 to-violet-500/20 border border-white/10 p-4">
                      <p className="font-semibold">Start here</p>
                      <p className="text-sm text-zinc-400 mb-3">Load the built-in drums, or upload a song or video to chop.</p>
                      <div className="flex gap-2">
                        <button onClick={() => s.loadKit()} className="h-10 px-4 rounded-full bg-white text-black text-sm font-semibold">Load drum kit</button>
                        <button onClick={() => setTab('samples')} className="h-10 px-4 rounded-full bg-zinc-800 text-sm">Upload →</button>
                      </div>
                    </div>
                  )}
                  <PadGrid s={s} />
                </>
              )}
              {tab === 'beat' && <Sequencer s={s} />}
              {tab === 'samples' && <Library s={s} />}
              {tab === 'scenes' && <Scenes s={s} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-zinc-950/90 backdrop-blur border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-xl grid grid-cols-4">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="relative h-16 flex flex-col items-center justify-center gap-0.5 text-xs">
              {tab === t.id && <motion.span layoutId="tab" className="absolute top-0 h-0.5 w-10 bg-rose-500 rounded-full" />}
              <span className={`text-lg ${tab === t.id ? 'text-white' : 'text-zinc-500'}`}>{t.icon}</span>
              <span className={tab === t.id ? 'text-white' : 'text-zinc-500'}>
                {t.label}
                {t.id === 'scenes' && s.scenes.length > 0 && <span className="ml-1 text-rose-400">{s.scenes.length}</span>}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
