import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '../utils/cn';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Hide the cancel button (e.g. informational errors). */
  showCancel?: boolean;
  variant?: 'default' | 'danger' | 'info';
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'بله',
  cancelLabel = 'انصراف',
  showCancel = true,
  variant = 'default',
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const focusTarget = variant === 'danger' && showCancel ? cancelButtonRef : confirmButtonRef;
    focusTarget.current?.focus();
  }, [variant, showCancel]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
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

  const danger = variant === 'danger';

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
        <div
          className={cn(
            'border-b border-slate-700/50 px-6 py-5',
            danger
              ? 'bg-gradient-to-l from-rose-950/40 via-transparent to-transparent'
              : 'bg-gradient-to-l from-cyan-950/20 via-transparent to-transparent'
          )}
        >
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
                'flex-1 rounded-2xl py-3.5 font-bold shadow-lg transition active:scale-[0.97]',
                danger
                  ? 'bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-rose-900/40 hover:from-rose-300 hover:to-rose-500'
                  : 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-slate-950 shadow-emerald-900/30 hover:from-emerald-300 hover:to-emerald-500'
              )}
            >
              {confirmLabel}
            </button>
            {showCancel && (
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={onCancel}
                className={cn(
                  'flex-1 rounded-2xl border border-slate-600/70 bg-slate-800/80 py-3.5 font-bold text-slate-100',
                  'transition hover:bg-slate-700 active:scale-[0.97]'
                )}
              >
                {cancelLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
