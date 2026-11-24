'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DEFAULT_FX, type Fx } from '@/lib/types';

const PRESETS: { name: string; fx: Partial<Fx> }[] = [
  { name: 'Reset', fx: {} },
  { name: 'Chipmunk', fx: { semis: 12 } },
  { name: 'Slowed', fx: { semis: -5, reverb: 0.35 } },
  { name: 'Lo-fi', fx: { filter: 'lowpass', cutoff: 1800, drive: 0.3 } },
  { name: 'Telephone', fx: { filter: 'highpass', cutoff: 900, q: 4, drive: 0.5 } },
  { name: 'Dub', fx: { delay: 0.5, delayTime: 0.375, reverb: 0.2 } },
  { name: 'Ghost', fx: { reverse: true, reverb: 0.6 } },
];

// log scale for cutoff: slider 0..1 ↔ 20Hz..20kHz
const toHz = (v: number) => Math.round(20 * Math.pow(1000, v));
const fromHz = (hz: number) => Math.log(hz / 20) / Math.log(1000);

export default function FxPanel({ fx, setFx }: { fx: Fx; setFx: (f: Fx) => void }) {
  const [open, setOpen] = useState(false);
  const set = (p: Partial<Fx>) => setFx({ ...fx, ...p });
  const changed = (Object.keys(DEFAULT_FX) as (keyof Fx)[]).filter((k) => fx[k] !== DEFAULT_FX[k]).length;

  return (
    <div className="rounded-2xl bg-zinc-800/40 border border-white/5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3">
        <span className="font-medium">Effects{changed ? <span className="ml-2 text-xs text-rose-400">{changed} on</span> : null}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-zinc-500">▾</motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-4 px-3 pb-4">
              <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-1">
                {PRESETS.map((p) => (
                  <button key={p.name} onClick={() => setFx({ ...DEFAULT_FX, ...p.fx })}
                    className="shrink-0 h-8 px-3 rounded-full bg-zinc-800 text-xs text-zinc-300">{p.name}</button>
                ))}
              </div>

              <Group title="Pitch">
                <div className="flex items-center gap-2">
                  <Step onClick={() => set({ semis: Math.max(-24, fx.semis - 12) })}>−12</Step>
                  <Step onClick={() => set({ semis: Math.max(-24, fx.semis - 1) })}>−1</Step>
                  <span className="flex-1 text-center tabular-nums font-semibold">{fx.semis > 0 ? '+' : ''}{fx.semis} st</span>
                  <Step onClick={() => set({ semis: Math.min(24, fx.semis + 1) })}>+1</Step>
                  <Step onClick={() => set({ semis: Math.min(24, fx.semis + 12) })}>+12</Step>
                </div>
                <Slider label="Fine" value={fx.cents} min={-100} max={100} step={1} fmt={(v) => `${v}¢`} onChange={(v) => set({ cents: v })} />
                <Toggle label="Reverse" on={fx.reverse} onChange={(v) => set({ reverse: v })} />
                <Toggle label="Choke (new hit cuts the last)" on={fx.choke} onChange={(v) => set({ choke: v })} />
              </Group>

              <Group title="Tone">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-900">
                  {(['off', 'lowpass', 'highpass'] as const).map((t) => (
                    <button key={t} onClick={() => set({ filter: t })}
                      className={`h-8 rounded-lg text-xs ${fx.filter === t ? 'bg-white text-black' : 'text-zinc-400'}`}>
                      {t === 'off' ? 'No filter' : t === 'lowpass' ? 'Low-pass' : 'High-pass'}
                    </button>
                  ))}
                </div>
                {fx.filter !== 'off' && (
                  <>
                    <Slider label="Cutoff" value={fromHz(fx.cutoff)} min={0} max={1} step={0.005}
                      fmt={() => (fx.cutoff >= 1000 ? `${(fx.cutoff / 1000).toFixed(1)}k` : `${fx.cutoff}`) + 'Hz'} onChange={(v) => set({ cutoff: toHz(v) })} />
                    <Slider label="Reso" value={fx.q} min={0.5} max={15} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => set({ q: v })} />
                  </>
                )}
                <Slider label="Drive" value={fx.drive} min={0} max={1} step={0.01} fmt={pct} onChange={(v) => set({ drive: v })} />
              </Group>

              <Group title="Space">
                <Slider label="Pan" value={fx.pan} min={-1} max={1} step={0.05} fmt={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} onChange={(v) => set({ pan: v })} />
                <Slider label="Delay" value={fx.delay} min={0} max={1} step={0.01} fmt={pct} onChange={(v) => set({ delay: v })} />
                {fx.delay > 0 && (
                  <Slider label="Time" value={fx.delayTime} min={0.05} max={1} step={0.005} fmt={(v) => `${Math.round(v * 1000)}ms`} onChange={(v) => set({ delayTime: v })} />
                )}
                <Slider label="Reverb" value={fx.reverb} min={0} max={1} step={0.01} fmt={pct} onChange={(v) => set({ reverb: v })} />
              </Group>

              <Group title="Fades">
                <Slider label="In" value={fx.attack} min={0.002} max={1} step={0.002} fmt={ms} onChange={(v) => set({ attack: v })} />
                <Slider label="Out" value={fx.release} min={0.01} max={2} step={0.01} fmt={ms} onChange={(v) => set({ release: v })} />
              </Group>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ms = (v: number) => (v >= 1 ? `${v.toFixed(2)}s` : `${Math.round(v * 1000)}ms`);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="h-9 min-w-11 px-2 rounded-lg bg-zinc-800 text-sm">{children}</button>;
}

function Slider({ label, value, min, max, step, fmt, onChange }: {
  label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-14 text-zinc-400">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="flex-1 accent-white h-8" />
      <span className="w-14 text-right tabular-nums text-xs text-zinc-300">{fmt(value)}</span>
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center justify-between text-sm h-9">
      <span className="text-zinc-400">{label}</span>
      <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-rose-500' : 'bg-zinc-700'}`}>
        <motion.span layout className={`block size-5 rounded-full bg-white ${on ? 'ml-auto' : ''}`} />
      </span>
    </button>
  );
}
