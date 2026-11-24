'use client';
import { useState } from 'react';
import { renderSceneWav } from '@/lib/audio';
import type { Scene } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';
import { Row, Section } from './Library';

export default function Scenes({ s }: { s: Studio }) {
  const [loop, setLoop] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  async function exportWav(sc: Scene) {
    setExporting(sc.id);
    const blob = await renderSceneWav(sc, s.byId);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${sc.name}.wav` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setExporting(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 text-sm">
        Loop playback
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="size-5 accent-white" />
      </label>

      <Section title="Scenes" hint="Record from the Pads tab">
        {s.scenes.map((sc) => {
          const playing = s.playingId === sc.id;
          if (renaming === sc.id)
            return (
              <form key={sc.id} className="flex gap-2" onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get('n') || '').trim();
                if (name) s.updateScene({ ...sc, name });
                setRenaming(null);
              }}>
                <input name="n" autoFocus defaultValue={sc.name} className="flex-1 h-12 px-3 rounded-xl bg-zinc-800 outline-none focus:ring-2 ring-white/20" />
                <button className="h-12 px-4 rounded-xl bg-white text-black font-medium">Save</button>
              </form>
            );
          return (
            <Row key={sc.id}
              left={<span className={`size-9 shrink-0 rounded-full grid place-items-center ${playing ? 'bg-white text-black' : 'bg-zinc-800'}`}>{playing ? '■' : '▶'}</span>}
              onClick={() => (playing ? s.stopScene() : s.startScene(sc, loop))}
              label={sc.name}
              sub={`${sc.events.length} hits · ${sc.duration.toFixed(1)}s`}
              extra={
                <button onClick={() => exportWav(sc)} className="h-9 px-2.5 rounded-lg bg-zinc-800 text-xs text-zinc-300">
                  {exporting === sc.id ? '…' : 'WAV'}
                </button>
              }
              onEdit={() => setRenaming(sc.id)}
              onDelete={() => s.removeScene(sc.id)} />
          );
        })}
      </Section>
    </div>
  );
}
