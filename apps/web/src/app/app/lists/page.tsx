"use client";

import { ListManager } from "@/features/lists/components/ListManager";
import { useTaskWorkspace } from "@/features/tasks/application/TaskWorkspaceProvider";

export default function ListsPage() {
  return (
    <section className="page-section lists-page" aria-labelledby="lists-title">
      <ListPageContent />
    </section>
  );
}

function ListPageContent() {
  const { lists, loading, error, createList, updateList, deleteList } = useTaskWorkspace();
  return <ListManager lists={lists} loading={loading} error={error} onCreate={createList} onUpdate={updateList} onDelete={deleteList} />;
}