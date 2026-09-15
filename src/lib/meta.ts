import { SITE } from './site'

function setMetaContent(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

/** Updates the tab title and the description/social tags for the current page. */
export function setPageMeta(title?: string, description: string = SITE.description): void {
  const fullTitle = title ? `${title} · ${SITE.name}` : SITE.name
  document.title = fullTitle
  setMetaContent('meta[name="description"]', 'name', 'description', description)
  setMetaContent('meta[property="og:title"]', 'property', 'og:title', fullTitle)
  setMetaContent('meta[property="og:description"]', 'property', 'og:description', description)
}
