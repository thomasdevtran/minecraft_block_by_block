<script setup lang="ts">
import { dismissToast, toasts } from '../lib/toast'
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['toast', t.kind]"
        :role="t.kind === 'error' ? 'alert' : 'status'"
      >
        <span class="icon" aria-hidden="true">{{ t.kind === 'success' ? '✓' : '!' }}</span>
        <span class="message">{{ t.message }}</span>
        <button class="close" aria-label="Dismiss" @click="dismissToast(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
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
  width: 2.25rem;
  height: 2.25rem;
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
  transition: opacity 0.2s, transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
