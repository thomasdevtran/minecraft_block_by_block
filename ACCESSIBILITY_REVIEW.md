# Accessibility and local release check — September 22, 2026

Local checks pass. The site is ready for a hosted preview; this is not a full WCAG certification or a production deployment sign-off.

## Changes

- Fixed clipped featured tiles on narrow screens; adjusted header, guide headings, theme controls, footer clearance and toast positioning for small screens and fixed guide navigation.
- Added meaningful descriptions to informative texture/skin images and the 3D preview. Repeated decorative images and color swatches are hidden from assistive technology to avoid duplicate announcements. Real-craft slots remain clearly labeled placeholders.
- Added a readable text alternative for every column in the current instruction row, including empty spaces and filler cubes. Map descriptions explain orientation and the available text alternative.
- Added labeled, keyboard-operable rotate, tilt, zoom and reset buttons to the 3D preview.
- Fixed guide arrow shortcuts intercepting arrows inside scrollable rows and other controls. Step changes now focus the new heading; progress announcements are concise.
- Associated skin-username help and validation errors with the input and exposed its invalid state.

## Verified locally

| Check | Result |
| --- | --- |
| Clean locked dependency install (`npm ci`) | Passed |
| Unit tests (`npm test`) | 64 passed across 7 files |
| Catalog validation (`npm run check:catalog`) | 1,105 entries and 2,001 referenced PNGs passed |
| TypeScript and production build (`npm run build`) | Passed |
| Dependency audit (`npm audit --json`) | Zero reported vulnerabilities |
| Whitespace/error check (`git diff --check`) | Passed; Windows line-ending warnings only |

Browser review used the Codex in-app browser and explicit CSS viewport sizes:

- Home: 320, 390, 768, 1024 and 1440 pixels wide. No remaining document-edge clipping in the reviewed controls.
- Skin entry, support, privacy and terms: 320, 768 and 1440 pixels wide.
- Saved skin guide: build steps at 320, 390, 768, 1024 and 1440; materials on mobile and assembly on desktop. Rose guide checked on mobile; built Red Tulip guide checked at 390.
- Reviewed routes/states had no missing image `alt` attributes, unnamed visible controls or unnamed graphic roles. Standalone visible targets passed the inspected 24-pixel minimum check. This was a focused DOM review, not an automated axe audit.
- Keyboard checks passed for skip link, mobile menu open/Escape/focus return, search clearing, row scrolling, step-heading focus and 3D camera buttons. Row arrow keys no longer change the step.
- Invalid skin username exposes the matching error and `aria-invalid`. A local API lookup returned a PNG successfully.
- Reviewed normal text theme-token pairs exceeded 4.5:1 in both themes; the lowest sampled light-theme pair was 4.69:1. This does not establish contrast for every rendered pixel or graphical detail.
- Built frontend served with configured security headers: home, item, skin, support, privacy and terms returned HTML; sampled texture, font and license files returned their expected content types. Production-preview keyboard navigation and the Red Tulip guide worked. No browser warnings/errors were captured in that preview run.

The build retains a warning for the lazy-loaded three.js chunk (558.07 kB, 138.71 kB gzip). It is not a build failure; real mobile loading performance still needs measurement.

## Remaining release checks

- Test a real hosted preview: direct routes, missing assets, serverless skin API, CSP and caching. Vite preview does not run Vercel functions or prove Vercel rewrite behavior.
- Verify the visitor counter with the actual hosting secrets and Redis integration. No production database was accessed in this pass.
- Check physical iPhone/Safari and Android/Chrome, Firefox, 200% text enlargement, and a real screen reader (NVDA or VoiceOver). Viewport emulation and accessibility-tree inspection do not replace these checks.
- Verify print output in the native print dialog and physically follow a complete craft guide. Real craft photos can replace the placeholders when available.
- Carry forward the unresolved launch decisions and operational checklist in [RELEASE_REVIEW.md](RELEASE_REVIEW.md); this UI pass does not clear those items.

No deployment was performed.
