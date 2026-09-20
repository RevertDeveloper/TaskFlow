export type ServiceWorkerUpdateListener = (registration: ServiceWorkerRegistration) => void;

const reloadAfterActivation = new WeakSet<ServiceWorkerRegistration>();

export function registerServiceWorker(onUpdate?: ServiceWorkerUpdateListener): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }

  let disposed = false;
  let registration: ServiceWorkerRegistration | null = null;
  const handleControllerChange = () => {
    if (!disposed && registration && reloadAfterActivation.has(registration)) {
      reloadAfterActivation.delete(registration);
      window.location.reload();
    }
  };

  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((nextRegistration) => {
    registration = nextRegistration;
    nextRegistration.addEventListener("updatefound", () => {
      const worker = nextRegistration.installing;
      if (!worker) {
        return;
      }
      worker.addEventListener("statechange", () => {
        if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdate?.(nextRegistration);
        }
      });
    });
  }).catch(() => undefined);
  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  };
}

export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration): void {
  if (!registration.waiting) {
    return;
  }
  reloadAfterActivation.add(registration);
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}
