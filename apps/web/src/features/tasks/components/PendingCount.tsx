type PendingCountProps = {
  count: number;
};

export function PendingCount({ count }: PendingCountProps) {
  return (
    <span className="pending-count" aria-label={`${count} ${count === 1 ? "tarea pendiente" : "tareas pendientes"}`}>
      <strong>{count}</strong>
      <span>{count === 1 ? "pendiente" : "pendientes"}</span>
    </span>
  );
}