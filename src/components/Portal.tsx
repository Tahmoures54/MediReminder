import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  /** Override the mount target. Defaults to document.body. Useful in tests. */
  container?: Element | null;
  /** Optional data attribute for debugging / CSS hooks. */
  rootAttribute?: string;
}

/**
 * Renders overlays directly under <body> so transformed or overflow-hidden
 * ancestors cannot clip or cover them.
 *
 * Gotchas to be aware of:
 * - React event bubbling still follows the React tree, NOT the DOM tree.
 *   A parent onClick will fire for events inside the portal, but a listener
 *   attached directly to document will also see them (as normal DOM events).
 * - Styles scoped to #root will not apply here; use global (Tailwind) classes.
 * - In SSR, this renders nothing on the server; in a Capacitor SPA that is
 *   the intended behaviour and there is no hydration mismatch because the
 *   app never server-renders.
 */
export function Portal({ children, container, rootAttribute }: PortalProps) {
  // Resolve the target once per mount. On the server (typeof window ===
  // 'undefined') this returns null, which is safe.
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    if (container) {
      setTarget(container);
      return;
    }
    if (typeof document !== 'undefined' && document.body) {
      setTarget(document.body);
    }
  }, [container]);

  if (!target) return null;

  const content = rootAttribute ? (
    <div data-portal-root={rootAttribute}>{children}</div>
  ) : (
    children
  );

  return createPortal(content, target);
}
