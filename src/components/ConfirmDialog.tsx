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
    // Focus dialog for accessibility
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const prevPadRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previous;
      document.body.style.paddingRight = prevPadRight;
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
        className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] backdrop-blur-md animate-fade-in touch-manipulation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
        style={{ paddingLeft: 'max(1rem, var(--sal))', paddingRight: 'max(1rem, var(--sar))' }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          tabIndex={-1}
          className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-scale-in outline-none max-h-[90dvh] overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleDialogKeyDown}
        >
          <div
            className={cn(
              'border-b border-white/5 px-6 py-5',
              danger ? 'bg-rose-500/10' : variant === 'info' ? 'bg-cyan-500/10' : 'bg-cyan-500/10'
            )}
          >
            <h3 id="confirm-title" className="text-xl font-black text-white text-balance">
              {title}
            </h3>
          </div>
          <div className="p-6">
            <p id="confirm-message" className="mb-6 whitespace-pre-line text-[15px] leading-relaxed text-slate-300">
              {message}
            </p>

            <div className="flex gap-3">
              {showCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="tap-target flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 text-[15px] font-bold text-slate-100 transition hover:bg-white/10 active:scale-[0.97] touch-manipulation"
                >
                  {cancelLabel}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={onConfirm}
                className={cn(
                  'tap-target flex-1 rounded-2xl py-4 text-[15px] font-bold shadow-lg transition active:scale-[0.97] touch-manipulation',
                  danger
                    ? 'bg-rose-500 text-white shadow-rose-950/50 hover:bg-rose-400 active:bg-rose-600'
                    : 'bg-emerald-400 text-slate-950 shadow-emerald-950/40 hover:bg-emerald-300 active:bg-emerald-500'
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
