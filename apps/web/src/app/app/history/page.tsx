export default function HistoryPage() {
  return (
    <section className="page-section" aria-labelledby="history-title">
      <p className="eyebrow">Registro</p>
      <h1 id="history-title">Historial</h1>
      <p className="page-lede">Una vista tranquila de lo que ya has terminado.</p>
      <div className="empty-panel">
        <p className="empty-panel__label">Aún no hay actividad</p>
        <h2>Lo completado quedará aquí.</h2>
        <p>El historial se conectará cuando el flujo manual de tareas esté disponible.</p>
      </div>
    </section>
  );
}