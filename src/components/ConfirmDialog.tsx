import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '../utils/cn';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-600/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-black/50 ring-1 ring-white/5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="border-b border-slate-700/50 bg-gradient-to-l from-rose-950/20 via-transparent to-transparent px-6 py-5">
          <h3 id="confirm-title" className="text-xl font-black text-white">
            {title}
          </h3>
        </div>
        <div className="p-6">
          <p id="confirm-message" className="mb-6 leading-relaxed whitespace-pre-line text-slate-300">
            {message}
          </p>

          <div className="flex gap-3">
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              className={cn(
                'flex-1 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 py-3.5 font-bold text-slate-950',
                'shadow-lg shadow-emerald-900/30 transition hover:from-emerald-300 hover:to-emerald-500 active:scale-[0.97]'
              )}
            >
              بله
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'flex-1 rounded-2xl border border-slate-600/70 bg-slate-800/80 py-3.5 font-bold text-slate-100',
                'transition hover:bg-slate-700 active:scale-[0.97]'
              )}
            >
              انصراف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
