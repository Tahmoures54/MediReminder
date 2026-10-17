import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Portal } from './Portal';

interface NotificationPopupProps {
  title: string;
  message: string;
  onClose: () => void;
  onRestart?: () => void;
  onSnooze?: (minutes: number) => void;
  isMedicationAlert?: boolean;
  closeOnOverlayClick?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function NotificationPopup({
  title,
  message,
  onClose,
  onRestart,
  onSnooze,
  isMedicationAlert = true,
  closeOnOverlayClick = false,
}: NotificationPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const messageId = useId();

  // Stable refs so the mount-only effects below never re-run when parent
  // re-renders with new inline arrow functions for onClose/onRestart/onSnooze.
  // Without this, the cleanup would restore focus to the restart button every
  // 50ms and trap keyboard users, and body scroll would flicker.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Effect 1 (once): capture the previously-focused element so it can be
  // restored on unmount, and restore it only if it is still in the DOM.
  useEffect(() => {
    previousFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const el = previousFocusedRef.current;
      if (el && document.contains(el) && typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
      }
    };
  }, []);

  // Effect 2 (once): initial focus. Prefer the primary action (Take), then
  // the close button. useLayoutEffect runs before paint, so the screen reader
  // reads the dialog with the intended target already focused.
  useLayoutEffect(() => {
    const target = restartButtonRef.current ?? closeButtonRef.current;
    target?.focus({ preventScroll: true });
  }, []);

  // Effect 3 (once): lock BOTH body and the app scroll container.
  // On iOS, `overflow: hidden` alone is ignored; `position: fixed` plus
  // scroll restoration is required.
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;

    const prevBody = {
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
      body.style.position = prevBody.position;
      body.style.top = prevBody.top;
      body.style.width = prevBody.width;
      body.style.overflow = prevBody.overflow;
      if (container) container.style.overflow = prevContainerOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Effect 4 (once): global keydown for Escape and Tab focus trap.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active && dialogRef.current.contains(active);

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center overflow-y-auto bg-black/85 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] backdrop-blur-sm touch-manipulation"
        onClick={closeOnOverlayClick ? onClose : undefined}
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
          onClick={(e) => e.stopPropagation()}
          className="relative my-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-red-400/40 bg-gradient-to-br from-red-700 via-rose-700 to-orange-700 shadow-[0_0_50px_rgba(239,68,68,0.45)] animate-pop-in max-h-[90dvh]"
        >
          {/* Decorative top bar — sticky so it stays visible while the body scrolls. */}
          <div
            className="sticky top-0 z-10 h-2 w-full bg-gradient-to-r from-yellow-300 via-orange-400 to-yellow-300 animate-pulse"
            aria-hidden="true"
          />

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
            <div className="mb-4 flex justify-center">
              <div
                className="rounded-full bg-white/15 p-4 shadow-lg ring-4 ring-white/20 animate-pulse"
                aria-hidden="true"
              >
                <span className="text-5xl drop-shadow-lg">💊</span>
              </div>
            </div>

            <h3
              id={titleId}
              className="mb-3 text-center text-2xl font-extrabold text-white drop-shadow-md text-balance sm:text-3xl"
            >
              {title}
            </h3>

            <p
              id={messageId}
              aria-live="assertive"
              className="mb-6 whitespace-pre-line text-center text-base font-medium leading-relaxed text-orange-50 sm:mb-8 sm:text-lg"
            >
              {message}
            </p>

            {isMedicationAlert && (
              <p className="mb-4 text-center text-sm font-bold text-yellow-200 animate-pulse">
                🔔 زنگ تا تأیید مصرف ادامه دارد — دقیق و مکرر
              </p>
            )}

            <div className="flex flex-col gap-3">
              {onRestart && (
                <button
                  ref={restartButtonRef}
                  type="button"
                  onClick={onRestart}
                  className="tap-target flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-4 text-base font-bold text-white shadow-[0_4px_14px_0_rgba(34,197,94,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-400 hover:shadow-[0_6px_20px_rgba(34,197,94,0.4)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200/40 touch-manipulation sm:text-lg"
                >
                  <span aria-hidden="true">✅</span>
                  مصرف کردم
                </button>
              )}

              {onSnooze && isMedicationAlert && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSnooze(10)}
                    className="tap-target rounded-xl bg-amber-500/95 px-4 py-4 text-sm font-bold text-white shadow-md transition-all hover:bg-amber-400 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200/30 touch-manipulation sm:text-base"
                  >
                    ⏰ ۱۰ دقیقه
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnooze(30)}
                    className="tap-target rounded-xl bg-amber-500/95 px-4 py-4 text-sm font-bold text-white shadow-md transition-all hover:bg-amber-400 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200/30 touch-manipulation sm:text-base"
                  >
                    ⏰ ۳۰ دقیقه
                  </button>
                </div>
              )}

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                title="یادآوری دوباره خواهد آمد"
                className="tap-target w-full rounded-xl bg-white/90 px-6 py-4 text-base font-bold text-red-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 touch-manipulation sm:text-lg"
              >
                بعداً — یادآوری کن
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-orange-100/80">
              برای بستن، کلید Esc را بزنید
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
