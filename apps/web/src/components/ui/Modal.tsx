"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${title.toLowerCase().replaceAll(" ", "-")}-title`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog ref={dialogRef} className="ui-modal" aria-labelledby={titleId} onClose={onClose}>
      <div className="ui-modal__header">
        <h2 id={titleId}>{title}</h2>
        <button className="ui-close-button" type="button" onClick={onClose} aria-label="Cerrar ventana">×</button>
      </div>
      <div className="ui-modal__body">{children}</div>
    </dialog>
  );
}