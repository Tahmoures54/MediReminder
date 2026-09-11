import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '../utils/cn';
import { Portal } from './Portal';

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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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
    <Portal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          tabIndex={-1}
          className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-scale-in outline-none"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleDialogKeyDown}
        >
          <div
            className={cn(
              'border-b border-white/5 px-6 py-5',
              danger ? 'bg-rose-500/10' : 'bg-cyan-500/10'
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
              {showCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3.5 font-bold text-slate-100 transition hover:bg-white/10 active:scale-[0.97]"
                >
                  {cancelLabel}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={onConfirm}
                className={cn(
                  'flex-1 rounded-2xl py-3.5 font-bold shadow-lg transition active:scale-[0.97]',
                  danger
                    ? 'bg-rose-500 text-white shadow-rose-950/50 hover:bg-rose-400'
                    : 'bg-emerald-400 text-slate-950 shadow-emerald-950/40 hover:bg-emerald-300'
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
