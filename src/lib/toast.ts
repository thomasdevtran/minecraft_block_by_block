import { ref } from 'vue'

export interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
}

export const toasts = ref<Toast[]>([])
let nextId = 1

/** Shows a short message in the corner. Errors stay a little longer. */
export function showToast(message: string, kind: Toast['kind'] = 'success'): void {
  const id = nextId++
  toasts.value = [...toasts.value.slice(-2), { id, kind, message }]
  setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3000)
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}
