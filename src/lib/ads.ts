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
