/**
 * A fetch that only ever runs once per page session.
 *
 * The `catch` that clears `pending` is the subtle part: without it a single failed request would
 * be cached forever and every later caller would get the same rejection, and the rejection would
 * also go unhandled. With it, a failure is retryable on the next call.
 */
export function loader<T>(url: string, errorMessage: string): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= fetch(url).then((res) => {
      if (!res.ok) throw new Error(errorMessage)
      return res.json() as Promise<T>
    })
    pending.catch(() => (pending = null))
    return pending
  }
}
