import { ref, watch } from 'vue'
import { readStored, writeStored } from './storage'

/** Which textures to show: today's, or the classic look from before the 1.14 texture update. */
export type Look = 'current' | 'classic'

const KEY = 'prefs:look'

/** Shared across pages, so switching in the catalog also switches the guides. */
export const look = ref<Look>(readStored<Look>(KEY, 'current') === 'classic' ? 'classic' : 'current')
watch(look, (v) => writeStored(KEY, v))
