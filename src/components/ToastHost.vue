<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { dismissToast, pauseToasts, resumeToasts, toasts } from '../lib/toast'

const host = ref<HTMLElement>()
const hovering = ref(false)
const focused = ref(false)
/** Where keyboard focus was before it entered a toast, so closing the last one can hand it back. */
let returnFocus: HTMLElement | null = null

watch([hovering, focused], ([hover, focus]) => (hover || focus ? pauseToasts() : resumeToasts()))
watch(() => toasts.value.length, (count) => {
  if (!count) hovering.value = focused.value = false
})

const inside = (node: EventTarget | null) => node instanceof Node && !!host.value?.contains(node)

function onFocusIn(event: FocusEvent) {
  if (!inside(event.relatedTarget)) returnFocus = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
  focused.value = true
}
function onFocusOut(event: FocusEvent) {
  if (!inside(event.relatedTarget)) focused.value = false
}

async function close(id: number) {
  const hadFocus = inside(document.activeElement)
  dismissToast(id)
  await nextTick()
  // A removed element can't report the pointer or focus leaving it, so re-check both.
  hovering.value = !!host.value?.matches(':hover')
  if (!hadFocus) return
  // Look the next toast up by id: the closing one is still in the DOM while it fades out, so a
  // plain '.close' query would find its own button and focus would be lost when it's removed.
  const remaining = toasts.value.at(-1)
  const next = remaining && host.value?.querySelector<HTMLButtonElement>(`[data-toast-id="${remaining.id}"] .close`)
  if (next) next.focus()
  else {
    focused.value = false
    if (returnFocus?.isConnected) returnFocus.focus()
    returnFocus = null
  }
}
</script>

<template>
  <div
    ref="host"
    class="toasts"
    aria-live="polite"
    @pointerover="hovering = true"
    @pointerout="!inside($event.relatedTarget) && (hovering = false)"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['toast', t.kind]"
        :data-toast-id="t.id"
        :role="t.kind === 'error' ? 'alert' : 'status'"
      >
        <span class="icon" aria-hidden="true">{{ t.kind === 'success' ? '✓' : '!' }}</span>
        <span class="message">{{ t.message }}</span>
        <button type="button" class="close" aria-label="Dismiss message" @click="close(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: calc(16px + var(--bottom-control-space, 0px));
  left: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 100;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(420px, 100%);
  padding: 0.65rem 0.6rem 0.65rem 0.9rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 2px solid var(--line);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  color: var(--ink);
  font-weight: 500;
}

.toast.success {
  border-color: var(--accent);
}

.toast.error {
  border-color: var(--error);
}

.icon {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.85rem;
  background: var(--accent);
  color: var(--accent-ink);
}

.error .icon {
  background: var(--error);
  color: var(--bg);
}

.message {
  flex: 1;
  min-width: 0;
}

.close {
  flex: none;
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  color: var(--ink-soft);
  font-size: 1.4rem;
  cursor: pointer;
  border-radius: 6px;
}

.close:hover {
  background: var(--surface-2);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
