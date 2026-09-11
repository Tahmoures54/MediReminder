import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Render overlays on document.body so transformed cards cannot cover them. */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
