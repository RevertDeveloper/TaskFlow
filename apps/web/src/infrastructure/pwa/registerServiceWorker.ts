export type ServiceWorkerUpdateListener = (registration: ServiceWorkerRegistration) => void;

export function registerServiceWorker(onUpdate?: ServiceWorkerUpdateListener): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }

  let disposed = false;
  const handleControllerChange = () => {
    if (!disposed) {
      window.location.reload();
    }
  };

  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((nextRegistration) => {
    nextRegistration.addEventListener("updatefound", () => {
      const worker = nextRegistration.installing;
      if (!worker) {
        return;
      }
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdate?.(nextRegistration);
        }
      });
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  };
}

export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}
