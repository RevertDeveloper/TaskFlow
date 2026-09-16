export default function SettingsPage() {
  return (
    <section className="page-section" aria-labelledby="settings-title">
      <p className="eyebrow">Preferencias</p>
      <h1 id="settings-title">Ajustes</h1>
      <p className="page-lede">Configura el espacio para que trabajar resulte natural.</p>
      <div className="empty-panel">
        <p className="empty-panel__label">Configuración base</p>
        <h2>Los temas ya están preparados.</h2>
        <p>Las preferencias de almacenamiento, sincronización y cuenta llegarán más adelante.</p>
      </div>
    </section>
  );
}