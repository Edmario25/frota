// ─── IndexedDB offline store para o App SMS de Campo ────────────────────────
// Armazena lançamentos feitos sem internet e dados de referência em cache.

const DB_NAME    = 'frota-sms-campo'
const DB_VERSION = 1

export type RecordType =
  | 'dds' | 'desvio' | 'inspecao' | 'apr' | 'rdo'
  | 'near_miss' | 'acidente' | 'pt'

export const RECORD_LABEL: Record<RecordType, string> = {
  dds:       'DDS',
  desvio:    'Desvio',
  inspecao:  'Inspeção',
  apr:       'APR',
  rdo:       'RDO',
  near_miss: 'Near Miss',
  acidente:  'Acidente/Incidente',
  pt:        'Permissão de Trabalho',
}

export interface OfflineRecord {
  id          : string           // client UUID — reusado como PK no servidor
  type        : RecordType
  data        : Record<string, unknown>
  obra_id     : string
  obra_nome   : string
  employee_id : string           // employees.id (não auth.uid)
  owner_user_id: string           // auth.users.id — isola dados entre contas no mesmo aparelho
  created_at  : string           // ISO string
  synced      : boolean
  sync_error ?: string
}

interface RefEntry { key: string; data: unknown; updated_at: string }

// ─── DB class ───────────────────────────────────────────────────────────────

class SmsOfflineDB {
  private db: IDBDatabase | null = null

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db)
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' })
          s.createIndex('synced', 'synced')
          s.createIndex('type',   'type')
        }
        if (!db.objectStoreNames.contains('ref')) {
          db.createObjectStore('ref', { keyPath: 'key' })
        }
      }
      req.onsuccess = () => { this.db = req.result; resolve(req.result) }
      req.onerror   = () => reject(req.error)
    })
  }

  async put(record: OfflineRecord): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite')
      tx.objectStore('records').put(record)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  }

  async claimLegacy(employeeId: string, ownerUserId: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite')
      const store = tx.objectStore('records')
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const record = cursor.value as OfflineRecord
        if (!record.owner_user_id && record.employee_id === employeeId) {
          record.owner_user_id = ownerUserId
          cursor.update(record)
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getAll(ownerUserId?: string): Promise<OfflineRecord[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('records', 'readonly')
      const req = tx.objectStore('records').getAll()
      req.onsuccess = () =>
        resolve((req.result as OfflineRecord[])
          .filter(r => !ownerUserId || r.owner_user_id === ownerUserId)
          .sort(
          (a, b) => b.created_at.localeCompare(a.created_at),
        ))
      req.onerror = () => reject(req.error)
    })
  }

  async getPending(ownerUserId: string): Promise<OfflineRecord[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('records', 'readonly')
      const idx = tx.objectStore('records').index('synced')
      const req = idx.getAll(IDBKeyRange.only(false))
      req.onsuccess = () => resolve((req.result as OfflineRecord[]).filter(r => r.owner_user_id === ownerUserId))
      req.onerror   = () => reject(req.error)
    })
  }

  async countPending(ownerUserId: string): Promise<number> {
    const p = await this.getPending(ownerUserId)
    return p.length
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('records', 'readwrite')
      const s   = tx.objectStore('records')
      const req = s.get(id)
      req.onsuccess = () => {
        const r = req.result as OfflineRecord | undefined
        if (r) { r.synced = true; delete r.sync_error; s.put(r) }
      }
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  }

  async markError(id: string, error: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('records', 'readwrite')
      const s   = tx.objectStore('records')
      const req = s.get(id)
      req.onsuccess = () => {
        const r = req.result as OfflineRecord | undefined
        if (r) { r.sync_error = error; s.put(r) }
      }
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  }

  async setRef(key: string, data: unknown): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('ref', 'readwrite')
      tx.objectStore('ref').put({ key, data, updated_at: new Date().toISOString() } satisfies RefEntry)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  }

  async getRef<T>(key: string): Promise<T | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('ref', 'readonly')
      const req = tx.objectStore('ref').get(key)
      req.onsuccess = () => resolve(req.result ? (req.result as RefEntry).data as T : null)
      req.onerror   = () => reject(req.error)
    })
  }
}

export const smsDb = new SmsOfflineDB()
