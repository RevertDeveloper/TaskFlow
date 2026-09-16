"use client";

import { useEffect } from "react";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("TaskFlow render error");
  }, []);

  return (
    <main className="error-page" aria-labelledby="error-title">
      <p className="eyebrow">Algo no salió bien</p>
      <h1 id="error-title">No hemos podido cargar esta vista.</h1>
      <p>Vuelve a intentarlo. Tus datos no se han enviado en este mensaje.</p>
      <button type="button" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}