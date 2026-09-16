import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * Becomes true the first time `el` comes near the viewport, and stays true.
 *
 * Used to hold back the expensive things — the three.js preview, an ad script — until the reader
 * is actually heading towards them. One-shot on purpose: once loaded, they stay loaded.
 */
export function useNearViewport(el: Ref<HTMLElement | null>, rootMargin: string): Ref<boolean> {
  const near = ref(false)
  let observer: IntersectionObserver | null = null

  const stop = () => {
    observer?.disconnect()
    observer = null
  }

  watch(
    el,
    (element) => {
      if (near.value || !element) return
      stop()
      if (typeof IntersectionObserver === 'undefined') {
        near.value = true
        return
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return
          near.value = true
          stop()
        },
        { rootMargin },
      )
      observer.observe(element)
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(stop)
  return near
}
