import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/*
 * Browser helpers shared by several components: when to do deferred work, when something is about
 * to scroll into view, and where keyboard focus should go after a list changes.
 */

// ---------------------------------------------------------------------------------------------
// Idle work
// ---------------------------------------------------------------------------------------------

/** Long enough that the work still happens on a busy page, short enough that it isn't forgotten. */
const IDLE_TIMEOUT = 4000
/** Roughly when a normal page has finished its initial burst of work. */
const FALLBACK_DELAY = 1500

/**
 * Runs `fn` once the browser has nothing better to do, and returns a function that cancels it.
 *
 * Safari only shipped `requestIdleCallback` in version 17, so the fallback matters. Keeping the
 * timing decisions in one place stops each call site inventing its own fallback delay.
 */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: IDLE_TIMEOUT })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(fn, FALLBACK_DELAY)
  return () => clearTimeout(id)
}

// ---------------------------------------------------------------------------------------------
// 3D support
// ---------------------------------------------------------------------------------------------

/**
 * Some browsers and older phones have no usable WebGL; 3D previews fall back to flat views.
 * The probe creates a real GPU context, so it releases it straight away — browsers only allow a
 * handful at once, and a leaked one here would eventually starve the actual preview.
 */
export function hasWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------
// Near the viewport
// ---------------------------------------------------------------------------------------------

/**
 * Becomes true the first time `el` comes near the viewport, and stays true.
 *
 * Used to hold back the expensive things — the three.js preview, an ad script — until the reader
 * is actually heading towards them. One-shot on purpose: once loaded, they stay loaded.
 * `threshold` is the share of `el` that must be visible (0 = any part), for effects that should
 * start only once the reader can actually see them.
 */
export function useNearViewport(el: Ref<HTMLElement | null>, rootMargin: string, threshold = 0): Ref<boolean> {
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
        { rootMargin, threshold },
      )
      observer.observe(element)
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(stop)
  return near
}

// ---------------------------------------------------------------------------------------------
// Focus after paging
// ---------------------------------------------------------------------------------------------

type FocusTarget = HTMLElement | null | undefined

/**
 * Previous/Next buttons replace a list in place. Without help, keyboard and screen-reader users
 * are left on the button at the bottom with nothing to say the list changed, and sighted users
 * have to scroll back up. Call `request()` from the button and `settle()` once the new page has
 * loaded or failed: focus moves to the first element `targets` returns (the new list, or the
 * message shown instead of it), which also scrolls it into view.
 *
 * Only button presses request focus, so filters, retries and first loads leave focus alone.
 */
export function usePageFocus(targets: () => FocusTarget[]) {
  let pending = false
  return {
    request() {
      pending = true
    },
    async settle() {
      if (!pending) return
      pending = false
      await nextTick()
      const element = targets().find((candidate): candidate is HTMLElement => !!candidate)
      if (!element) return
      if (!element.hasAttribute('tabindex')) element.tabIndex = -1
      element.focus()
    },
  }
}
