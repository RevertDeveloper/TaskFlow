"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

type DrawerProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Drawer({ open, title, children, onClose }: DrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = `drawer-title-${useId()}`;

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="ui-drawer-layer">
      <button className="ui-drawer-backdrop" type="button" aria-label="Cerrar panel" onClick={onClose} />
      <aside ref={drawerRef} className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ui-drawer__header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeButtonRef} className="ui-close-button" type="button" onClick={onClose} aria-label="Cerrar panel">×</button>
        </div>
        <div className="ui-drawer__body">{children}</div>
      </aside>
    </div>
  );
}