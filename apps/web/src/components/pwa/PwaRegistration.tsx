"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { activateWaitingServiceWorker, registerServiceWorker } from "@/infrastructure/pwa/registerServiceWorker";

export function PwaRegistration() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => registerServiceWorker(setRegistration), []);

  if (!registration) {
    return null;
  }

  return (
    <aside className="pwa-update" role="status" aria-live="polite">
      <span>Hay una actualizacion lista.</span>
      <button type="button" onClick={() => activateWaitingServiceWorker(registration)}>
        <RefreshCw size={15} aria-hidden="true" />
        Actualizar
      </button>
    </aside>
  );
}
