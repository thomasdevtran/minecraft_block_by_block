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
  legalUpdated: '7 November 2026',
}

/**
 * Homepage starter projects. Put photos in public/crafts/ and point `photo` (and `showcasePhoto`)
 * at them; an empty path keeps the labeled placeholder. Use landscape crops.
 */
export const starterBuilds = [
  { id: 'rose', note: 'Bring a classic Minecraft flower to life.', photo: '/crafts/rose.jpg' },
  { id: 'emerald', note: 'Make a little treasure, one row at a time.', photo: '/crafts/emerald.jpg' },
  { id: 'red_tulip', note: 'Add a splash of red to your craft collection.', photo: '/crafts/red-tulip.jpg' },
]
export const showcasePhoto = '/crafts/showcase.jpg'
/** Starter links open with this many paints, and the homepage counts use it too. */
export const starterPaintLimit = 8

/**
 * Advertising is intentionally off for launch.
 *
 * Do not enable by flipping this flag alone. Before launch with ads:
 * - Review Minecraft usage rules and the actual audience (including COPPA obligations).
 * - Select a provider and confirm current eligibility, publisher/site approval and ad-unit IDs.
 * - Implement the required consent choices and child-audience configuration.
 * - Update privacy disclosures, CSP, third-party contracts and any ads.txt requirements.
 * - Confirm hosting-plan terms (Vercel Hobby excludes commercial advertising use).
 * - Verify declined/withdrawn consent prevents ad scripts and requests.
 *
 * The existing slot is a placeholder, not a completed or approved ad integration.
 */
export const ADS_ENABLED = false
export const ADSENSE_CLIENT = ''
export const AD_SIZE = { width: 300, height: 250 } as const
