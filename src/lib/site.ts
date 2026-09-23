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
  legalUpdated: '22 September 2026',
}
