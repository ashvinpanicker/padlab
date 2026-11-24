'use client';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Bottom sheet on mobile, centered dialog on desktop. */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto bg-zinc-900 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">{title}</h2>
              <button onClick={onClose} className="size-9 rounded-full bg-zinc-800 text-zinc-400">✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
