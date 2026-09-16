export default function DashboardPage() {
  return (
    <section className="page-section" aria-labelledby="dashboard-title">
      <p className="eyebrow">Espacio personal</p>
      <h1 id="dashboard-title">Tus tareas, en claro.</h1>
      <p className="page-lede">Captura lo importante y vuelve a lo que tienes entre manos.</p>
      <div className="empty-panel">
        <p className="empty-panel__label">Panel preparado</p>
        <h2>Tu bandeja aparecerá aquí.</h2>
        <p>La gestión de tareas se conecta en la siguiente fase del producto.</p>
      </div>
    </section>
  );
}