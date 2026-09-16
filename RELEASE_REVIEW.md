# Public release review — 16 September 2026

The site has been refined and verified locally and renamed **Block by Cube**. **Do not treat it as legally cleared or already deployed.** The remaining material launch decisions are formal name clearance, rights to the extracted game artwork, payment-account verification, and the live hosting/privacy configuration.

Operator details supplied for this review: **babiiyi**, California, United States; **toemasu1452@gmail.com**. Launch intent: free guides, voluntary support payments, an approximate visitor total, and advertising only in a later release.

**What changed and why**

| Area | Finding | Implemented change |
| --- | --- | --- |
| Mobile navigation | Broad nav CSS also positioned the footer as a dropdown. | Header-only selectors; footer links remain in document flow. |
| Catalog | Unlabeled featured builds, weak section hierarchy and endless loading made navigation harder. | Featured labels, a short three-step explanation, clear result totals, retry/loading states and explicit Show more pagination. |
| Small screens | Compact controls and inconsistent page treatment. | Larger touch targets, compact featured artwork, stacked layouts and better legal/support typography. |
| Appearance | The site followed the device theme with no explicit control. | Light, dark and device-setting choices in the footer. |
| Keyboard navigation | Page changes did not move focus; guide shortcuts could capture control keys. | Focusable main landmark, route focus, Escape focus recovery and guarded arrow shortcuts. |
| Accessible instructions | 3D layer grids did not expose exact cube locations as text. | Expandable row/column instructions, table captions and column-header scope. |
| Safety | Small-part and glue/paint warnings were buried in the terms. | Safety guidance appears with the materials list and links to fuller instructions. |
| Privacy claims | “No personal information,” “no records,” and “no consent needed” were too absolute; Vercel analytics contradicted the copy. | Rewritten, implementation-based disclosures; optional counting; removal of the extra analytics loader. |
| Local privacy | Visitors had no in-site control for saved build data. | Clear-build-data flow with confirmation; it preserves privacy and appearance preferences. |
| Visitor statistics | The counter was described as exact people, also collected views/history and could fall back to temporary production data. | Only the opted-in aggregate is measured; approximate labeling; deployed missing-config/error states fail closed. |
| Payments | Blanket no-refund language, unsupported “always ad-free” promise and overstated audience-proof claims. | Voluntary-support terms, refund contact and statutory-rights language; removed unsupported guarantees and unverifiable history link. |
| Branding | Grass-block-style app icon and little separation from Minecraft's identity. | Original plain craft-cube mark, prominent non-affiliation notice and direct operator contact. |
| Skin service | No upstream deadline, arbitrary returned texture URLs, malformed path errors and raw exception messages. | Deadlines, exact official-host/path allowlist, blocked redirects, bounded PNG download, dimension checks and controlled error responses. |
| Uploads | Large/wrong-dimension files were decoded before rejection; concurrent operations could race. | Size and PNG-header checks before image decode, supported-dimension checks and operation locking. |
| Saved state | Corrupt local data could break preferences or progress. | Shape validation, valid skin-data checks and bounded saved step indexes. |
| 3D rendering | WebGL1 probe did not match the renderer's requirements, and GPU resources were not fully released. | WebGL2 probe, graceful renderer failure, resource disposal and observer fallback. |
| Security headers | Missing CSP and framing protection. | Same-origin CSP, DENY framing, existing nosniff/referrer/device protections; preview applies the same headers. |
| Asset routing/cache | SPA fallback could interfere with missing static files; catalog could remain stale for a long time. | Static/API exclusions and shorter catalog CDN caching. |
| Metadata | Guide titles were reset when build options changed. | Preserve data-specific titles; update social text; client-side noindex for missing pages and local skin guides. |
| Dependencies | Full audit found five issues under an unused development package. | Removed unused @vercel/node and 109 transitive packages; no known audit findings remain. |
| Notices and maintenance | Software attribution was incomplete and release checks were manual. | Build-generated license texts, a complete catalog checker and a GitHub release-check workflow. |

Existing working-tree changes and staged assets were preserved. No commits, public deployment, payment, third-party messages or production database changes were made.

**Verification completed**

| Check | Result and limits |
| --- | --- |
| Production build / TypeScript | Passed with Node 24.12.0. |
| Automated tests | 52 passed across 5 files: existing engine tests, server consent/privacy boundaries, skin-service validation, browser counting consent and local-storage recovery/deletion scope. |
| Catalog integrity | 1,105 unique catalog entries and 2,001 referenced PNGs validated, including classic textures, six-face strips and flower pots. This verifies availability/dimensions, not the physical accuracy of every finished craft. |
| Dependency audit | Full npm audit: zero known vulnerabilities at review time. This is not a security guarantee. |
| Desktop/mobile views | Rendered in the available Chromium-based browser at desktop, 390px and 320px widths; inspected dark and light appearances. |
| Catalog interaction | Search, zero results and clear filters checked in browser. |
| Item guide | Diamond Sword loaded; Start advanced; step remained after refresh. Grass Block switched between hollow (1,352) and solid (4,096), 2D/3D and old/new textures. |
| Skins | Live Mojang lookup for jeb_ succeeded. A generated 64×32 local PNG produced a guide and switched to 2D. Invalid username feedback checked. API validation/failure paths covered by tests. |
| Navigation | Mobile menu and Escape behavior checked; footer remains static, not positioned over page content. |
| Privacy | Off choice visibly reflected; consent, withdrawal before deferred send, GPC suppression and selective local deletion tested. |
| Production frontend | Built site worked with configured CSP; inspected guide/support/legal routes had no browser error/warning entries. Local Vite preview does not execute Vercel APIs. |
| Narrow layouts | No horizontal document overflow in inspected narrow skin-guide, privacy and support screens. |
| Accessibility | Keyboard/focus semantics, visible labels, touch targets and text equivalents improved. No full WCAG conformance claim: a formal screen-reader and cross-browser audit remains. |

The roughly 557 KB uncompressed three.js preview chunk still triggers Vite's size warning. It is lazy-loaded and is about 138 KB gzipped. The written instructions do not wait for it. This is a known optimization opportunity, not a failed build.

**Legal decisions to resolve before public promotion**

1. **Clear the new name before investing in the brand.** The site is now **Block by Cube**, replacing the name shared with the existing [Block by Block organization](https://www.blockbyblock.org/). Header, accessible home-link label, page metadata, legal-page identity, support heading, web manifest and package/documentation names were updated. Preliminary exact-name web searches did not surface an obvious matching brand; this is not a trademark-registry search, domain-availability check or legal clearance. The existing GitHub repository URL and internal counter keys remain valid and unchanged. Obtain qualified clearance before substantial investment.

2. **Review the extracted artwork and intended distribution.** The repository serves game textures directly. Minecraft's [Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) distinguish branding, assets and permitted fan activities; a general fan-site permission should not be treated as automatic permission for every extracted-file use. Obtain advice on this catalog and public repository, including monetization. Software/font license notices do not license Mojang artwork.

3. **Confirm the operator disclosures required for your situation.** The pages use the handle, email and California location you supplied. A handle may not satisfy every identity/address requirement that applies to an operator, payment recipient or child-directed service. Do not publish a home address without considering an appropriate business contact arrangement. A qualified reviewer should determine the needed disclosures and any California business-name/registration obligations.

4. **Assess the child audience.** Minecraft-inspired craft content may attract children. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) addresses audience determination, persistent identifiers and limited internal-operations exceptions. The optional count is not a parental-consent system. Determine the applicable basis/exemption and required notices before launch; revisit the assessment before any ads, accounts, public uploads or messaging features.

5. **Finalize retention and service-provider arrangements.** IP addresses and usernames can enter hosting logs even when the application does not store them in a database. Confirm actual Vercel and Upstash retention, regions, access controls, backups and contractual terms. Set and document retention for contact emails and payment records. The public notice currently avoids inventing exact provider retention periods. Add precise information once verified, and assess any international-transfer requirements.

6. **Confirm payment destinations and rules.** The existing links remain https://ko-fi.com/babiiyi and https://paypal.me/babiiyi. This review could not verify their recipient identity with the web tool; ownership and successful checkout were not established. Confirm both accounts yourself before accepting money. Publish matching operator/non-affiliation information on those pages. Decide how refund requests and recurring contributions will be handled. Have a tax professional address recordkeeping and tax treatment; the site makes no tax-deductibility claim.

The revised text is a practical draft tied to the code, not a legal opinion or certification of California, EU/UK or children's-privacy compliance.

**Visitor-count design and operational implications**

The requested measurement is implemented as one optional total. It does not measure page views, click events or session histories. Visitors who decline are not counted; therefore it cannot represent all users.

On explicit opt-in, the server forms an HMAC of the request's IP/browser combination, submits it to a Redis HyperLogLog and retains the aggregate. Different devices and IPs can overcount; shared configurations can undercount. The advertised statistical error concerns the HyperLogLog algorithm only. The counter is not fraud-proof or independently audited.

Counting is off until permission is given, with equal allow/decline controls and an off switch in Privacy. GPC/DNT suppresses counting. This is a conservative implementation choice; [ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/) covers more than cookies, and any applicable exemption has conditions. Do not restore the former blanket “no cookies means no permission” claim.

The deployed counter requires UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN and a VISITOR_SALT of at least 32 characters. Without them it reports unavailable instead of displaying an unreliable temporary total. Never expose these as VITE_ variables. Keep the HMAC key stable; rotation against the same aggregate can overcount. Use a new documented counting period/key when appropriate.

The new Redis key is bbb:hll:consenting:v1. It intentionally starts separately from the previous automatic count. Legacy database keys and old CSV history were not deleted or migrated; review them under the retention plan. The optional repository workflow snapshots only the aggregate and is inactive unless SITE_URL is configured. Git history is not an independent audience audit.

Vercel overwrites forwarded-IP headers at its edge; see [Vercel request headers](https://vercel.com/docs/headers/request-headers). Review this trust boundary if another proxy or host is introduced.

**Deployment checklist**

- Resolve the name and artwork questions above.
- Verify both support accounts; verify the public contact email receives mail.
- Configure the final domain and HTTPS. Add the canonical origin, absolute social-preview URL and sitemap after the domain/name decision.
- Configure the counter's server-only secrets, provider access and retention; keep Vercel Web Analytics disabled.
- Add edge/WAF rate limits and spending alerts for /api/skin/* and /api/stats. Application-origin and bot checks are not a substitute for abuse protection.
- Run npm ci, npm test, npm run check:catalog, npm run build and npm audit. The new CI workflow repeats these checks on push/PR; it has not been run on GitHub in this task.
- Test a real Vercel preview: direct route loads, texture/font/license content types, CSP headers, expected API errors and live skin lookup. Confirm missing assets are not returned as index.html.
- Test the production Redis integration: one opted-in request writes, decline/GPC/DNT does not write, and the displayed total survives new function instances. Preview deployments intentionally do not write.
- Check the privacy notice against actual host logs and provider settings before switching a deployment public.
- Verify current browsers on a real iPhone/Safari, Android/Chrome and Firefox; test keyboard-only use and a screen reader. Browser emulation is not physical-device validation.
- Smoke-test at least one real assembled item and a hollow 3D block; generated counts do not prove material strength or glue stability.
- Record a rollback target and a process for responding to security/privacy emails.

**Before adding advertisements**

Advertising is still disabled, and the current ad component is only a placeholder. Do not turn it on by changing a boolean. The restrictive CSP currently blocks outside ad scripts.

Select the provider, verify publisher and site eligibility, obtain real ad-unit identifiers, assess child-directed treatment, implement the required consent/withdrawal flow, update notices/contracts/CSP and check ads.txt routing. Verify both accepted and declined states and ensure ad placement does not cause layout shifts or misleading clicks.

[Vercel's fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines) distinguishes donations from commercial use and restricts Hobby to personal non-commercial usage. Recheck plan suitability before advertising. Donation permission from a host does not settle Minecraft content rights or payment-provider obligations.

**Further work I can do once the necessary decisions are supplied**

- Align external payment-page branding and a chosen domain with Block by Cube after account access and name clearance.
- Replace the extracted catalog with original or appropriately licensed art, or implement browser-only imports so visitors supply their own files without the site redistributing them. These are proposed alternatives; the existing artwork has not been removed or legally cleared.
- Configure and test a Vercel preview and production rollout with your chosen domain and approved privacy settings.
- Add domain-specific sitemap/canonical/social metadata and pre-render public catalog/guide pages for search and sharing.
- Build a complete advertising integration after the audience, provider, hosting and consent decisions are resolved.
- Add printable materials lists, a cube-size-to-finished-size calculator and exportable guide sheets.
- Preserve catalog search/category state when returning from a guide and add shareable filtered URLs.
- Add automated browser/accessibility checks across devices and a tested no-WebGL/network-error matrix.
- Investigate reducing the 3D download and document real mobile performance with repeatable measurements.
