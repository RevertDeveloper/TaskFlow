export default function ListsPage() {
  return (
    <section className="page-section" aria-labelledby="lists-title">
      <p className="eyebrow">Organización</p>
      <h1 id="lists-title">Listas</h1>
      <p className="page-lede">Agrupa tus tareas por proyecto, contexto o ritmo.</p>
      <div className="empty-panel">
        <p className="empty-panel__label">Sin listas todavía</p>
        <h2>Empieza con Inbox.</h2>
        <p>Las listas y el Inbox permanente se habilitarán junto al dominio de tareas.</p>
      </div>
    </section>
  );
}