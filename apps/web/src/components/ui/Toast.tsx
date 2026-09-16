import type { ReactNode } from "react";

type ToastProps = {
  message: ReactNode;
  tone?: "info" | "success" | "error";
  onDismiss?: () => void;
};

export function Toast({ message, tone = "info", onDismiss }: ToastProps) {
  return (
    <div className={`ui-toast ui-toast--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      <span>{message}</span>
      {onDismiss ? <button type="button" onClick={onDismiss} aria-label="Cerrar notificación">×</button> : null}
    </div>
  );
}