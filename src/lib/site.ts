/** Site-wide details used in the header, footer and page metadata. */
export const SITE = {
  name: 'Block by Cube',
  description: 'Step-by-step guides for building Minecraft items, blocks and skins out of real cubes.',
  github: 'https://github.com/thomasdevtran/minecraft_block_by_block',
  tiktok: { handle: '@babiiyi', url: 'https://www.tiktok.com/@babiiyi' },
  /** Discord usernames can't be linked to directly, so the footer copies it instead. */
  discord: 'babiiyi',

  /** Who runs the site, shown on the Privacy and Terms pages and in the footer copyright. */
  operator: {
    name: 'babiiyi',
    email: 'toemasu1452@gmail.com',
    /** Used for the governing-law line in the Terms. */
    country: 'California, United States',
  },
  /**
   * Where donations go. Plain links, never the Ko-fi or PayPal embed widgets — those load
   * third-party scripts and cookies, which would cost the site both its speed and its
   * "no third-party scripts" promise on the privacy page.
   * Set these to your real pages; leave one empty to hide that button.
   */
  support: {
    kofi: 'https://ko-fi.com/babiiyi',
    paypal: 'https://paypal.me/babiiyi',
  },

  /** Shown as "last updated" on the legal pages. */
  legalUpdated: '22 November 2026',
}

/**
 * A craft photo: a landscape (16:10) JPEG in public/crafts/, plus optional smaller WebP copies
 * beside it named `<name>-<width>.webp` (rose.jpg → rose-480.webp, rose-960.webp, rose-1440.webp).
 * List the widths you made in `webp`; browsers then download the smallest copy that fills the
 * space, about a tenth of the JPEG's size. Without `webp` only the JPEG is used.
 */
export interface Photo { jpg: string; webp?: number[] }
const WEBP_WIDTHS = [480, 960, 1440]

/** Homepage starter projects. Leave `photo` out to show the labeled placeholder. */
export const starterBuilds: { id: string; note: string; photo?: Photo }[] = [
  { id: 'rose', note: 'Bring a classic Minecraft flower to life.', photo: { jpg: '/crafts/rose.jpg', webp: WEBP_WIDTHS } },
  { id: 'emerald', note: 'Make a little treasure, one row at a time.', photo: { jpg: '/crafts/emerald.jpg', webp: WEBP_WIDTHS } },
  { id: 'red_tulip', note: 'Add a splash of red to your craft collection.', photo: { jpg: '/crafts/red-tulip.jpg', webp: WEBP_WIDTHS } },
]
export const showcasePhoto: Photo = { jpg: '/crafts/showcase.jpg', webp: WEBP_WIDTHS }
/** Starter links open with this many paints, and the homepage counts use it too. */
export const starterPaintLimit = 8
