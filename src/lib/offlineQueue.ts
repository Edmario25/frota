/**
 * Offline mutation queue — persiste operações no localStorage e sincroniza
 * quando a conexão volta.
 */

export type QueuedOperation = {
  id: string;
  timestamp: number;
  table: string;
  action: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>; // dados auxiliares (ex: vehicleId)
};

const QUEUE_KEY = "frota_offline_queue";

export function getQueue(): QueuedOperation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueue(op: Omit<QueuedOperation, "id" | "timestamp">): QueuedOperation {
  const item: QueuedOperation = {
    ...op,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const queue = getQueue();
  queue.push(item);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return item;
}

export function dequeue(id: string): void {
  const queue = getQueue().filter(op => op.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function queueSize(): number {
  return getQueue().length;
}
