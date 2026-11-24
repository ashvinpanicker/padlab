# PadLab

Mobile-first web sampler. Next.js 16, Tailwind 4, Framer Motion. No backend — all data lives in the browser (IndexedDB).

- **Samples**: upload audio or video → drag start/end on the waveform (±10ms nudge) → preview → assign to one of 16 pads
- **Pads**: tap to play (desktop keys 1234 / QWER / ASDF / ZXCV). "Assign" to remap.
- **Record scene**: hit Record, play pads, Stop → saved as a scene (leading silence trimmed)
- **Scenes**: play / loop, rename, delete, export as WAV

```
npm i
npm run dev      # http://localhost:3000
npm run build    # static export to ./out — deploy anywhere (Vercel, Netlify, S3)
```

Code map: `lib/audio.ts` (Web Audio engine, WAV render), `lib/useStudio.ts` (state + persistence), `lib/db.ts` (IndexedDB), `components/*` (UI).

Note: iPhone's silent switch mutes Web Audio.
