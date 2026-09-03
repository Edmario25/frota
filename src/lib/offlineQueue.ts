/**
 * Offline mutation queue — persiste operações no localStorage e sincroniza
 * quando a conexão volta.
 */

export type QueuedOperation = {
  id: string;
  owner_user_id: string;
  timestamp: number;
  table: string;
  action: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>; // dados auxiliares (ex: vehicleId)
};

const QUEUE_KEY = "frota_offline_queue";

export function getQueue(ownerUserId?: string): QueuedOperation[] {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedOperation[];
    return ownerUserId ? queue.filter(op => op.owner_user_id === ownerUserId) : queue;
  } catch {
    return [];
  }
}

export function enqueue(op: Omit<QueuedOperation, "id" | "timestamp">): QueuedOperation {
  if (!op.owner_user_id) throw new Error("Usuário da operação offline não informado");
  const id = crypto.randomUUID();
  const item: QueuedOperation = {
    ...op,
    id,
    timestamp: Date.now(),
    payload: op.action === "insert" ? { id, ...op.payload } : op.payload,
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

export function claimLegacyQueue(ownerUserId: string, employeeId: string): void {
  const queue = getQueue();
  let changed = false;
  for (const op of queue) {
    if (!op.owner_user_id && (op.payload.created_by === ownerUserId || op.payload.employee_id === employeeId)) {
      op.owner_user_id = ownerUserId;
      changed = true;
    }
  }
  if (changed) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(ownerUserId?: string): void {
  if (!ownerUserId) { localStorage.removeItem(QUEUE_KEY); return; }
  const queue = getQueue().filter(op => op.owner_user_id !== ownerUserId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function queueSize(): number {
  return getQueue().length;
}
