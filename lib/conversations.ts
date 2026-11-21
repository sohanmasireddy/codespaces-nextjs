import type { UIMessage } from 'ai'
import type { ModelId, ResponseMode, ThinkingLevel } from './models'

export type Conversation = {
  id: string
  title: string
  updatedAt: number
  messages: UIMessage[]
  modelId: ModelId
  mode: ResponseMode
  thinkingLevel: ThinkingLevel
  modelPreferences?: Partial<Record<ModelId, { mode: ResponseMode; thinkingLevel: ThinkingLevel }>>
}

const databaseName = 'cloudflare-chat'
const storeName = 'conversations'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open chat storage.'))
  })
}

export async function loadConversations() {
  const database = await openDatabase()
  return new Promise<Conversation[]>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as Conversation[])
    request.onerror = () => reject(request.error ?? new Error('Could not load saved chats.'))
    request.transaction?.addEventListener('complete', () => database.close(), { once: true })
  })
}

export async function saveConversation(conversation: Conversation) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(conversation)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Could not save this chat.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Saving this chat was interrupted.'))
    }
  })
}

export async function removeConversation(id: string) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(id)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Could not delete this chat.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Deleting this chat was interrupted.'))
    }
  })
}
