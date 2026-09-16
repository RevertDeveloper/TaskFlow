"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

type DrawerProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Drawer({ open, title, children, onClose }: DrawerProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="ui-drawer-layer">
      <button className="ui-drawer-backdrop" type="button" aria-label="Cerrar panel" onClick={onClose} />
      <aside className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="ui-drawer__header">
          <h2 id="drawer-title">{title}</h2>
          <button className="ui-close-button" type="button" onClick={onClose} aria-label="Cerrar panel">×</button>
        </div>
        <div className="ui-drawer__body">{children}</div>
      </aside>
    </div>
  );
}