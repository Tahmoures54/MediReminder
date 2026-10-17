import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  // Capture the previously focused element BEFORE mount so we can restore it
  // on unmount. This is the "return focus" contract of dialogs.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const el = previouslyFocusedRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) {
        el.focus({ preventScroll: true });
      }
    };
  }, []);

  // Escape closes. Stable across renders even if onCancel is a lambda.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initial focus: prefer Cancel for destructive dialogs (Enter must not
  // accidentally delete a medication), otherwise prefer Confirm.
  useEffect(() => {
    const target = variant === 'danger'
      ? cancelButtonRef.current ?? confirmButtonRef.current
      : confirmButtonRef.current ?? cancelButtonRef.current;
    target?.focus({ preventScroll: true });
  }, [variant]);

  // Lock BOTH body and the app scroll container. On iOS, `overflow: hidden`
  // alone is a no-op; `position: fixed` + scroll restoration is required.
  // The app also has .app-scroll-container with its own overflow, so it must
  // be frozen too — otherwise the background scrolls under the dialog.
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;

    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    const container = document.querySelector<HTMLElement>('.app-scroll-container');
    const prevContainerOverflow = container?.style.overflow ?? '';
    if (container) container.style.overflow = 'hidden';

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      if (container) container.style.overflow = prevContainerOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const handleDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((el) => !el.hasAttribute('inert') && el.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === root) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
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
        style={{
          paddingLeft: 'max(1rem, var(--sal))',
          paddingRight: 'max(1rem, var(--sar))',
        }}
      >
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          tabIndex={-1}
          className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-scale-in outline-none"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleDialogKeyDown}
        >
          <div
            className={cn(
              'shrink-0 border-b border-white/5 px-6 py-5',
              danger ? 'bg-rose-500/10' : 'bg-cyan-500/10'
            )}
          >
            <h3 id={titleId} className="text-xl font-black text-white text-balance">
              {title}
            </h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-6">
              <p
                id={messageId}
                className="mb-6 whitespace-pre-line text-[15px] leading-relaxed text-slate-300"
              >
                {message}
              </p>

              <div className="flex gap-3">
                {showCancel && (
                  <button
                    ref={cancelButtonRef}
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
      </div>
    </Portal>
  );
}
