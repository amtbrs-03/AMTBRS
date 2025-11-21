## Quick repo summary

This is a minimal static single-page site. The primary entry is `anasayfa.html` — a self-contained HTML file with CSS and (mostly) inline JavaScript. There is no build system, package manifest, or server code in the repository.

## What matters for edits

- Entry file: `anasayfa.html` — contains layout, styles, markup and the main interactive hooks (modals, auth, cart, product cards).
- Key IDs/classes to reference in changes:
  - IDs: `authModal`, `authContainer`, `userContainer`, `cartBtn`, `cartCount`, `cartContainer`, `loginEmail`, `loginPassword`, `registerName`, `registerEmail`
  - Classes: `.product-card`, `.product-image`, `.product-name`, `.product-price`, `.modal`, `.modal-content`, `.form-content`
  - JS functions referenced in markup to search for before editing: `openAuthModal`, `closeAuthModal`, `switchTab`, `loginUser`, `logout`, `openCart`.

## Agent goals & constraints

- Keep the site static and client-side only unless the user explicitly asks to add a backend. Edits should not assume Node, npm, or build tools.
- Prefer small, reversible edits: add a small inline `<script>` block or a new JS file placed next to `anasayfa.html` if needed — don't rework the whole layout.
- When adding JS that touches auth/cart, persist state to `localStorage` only. Do not add network calls unless the user provides credentials or endpoints.

## How to test changes locally

1. Open `anasayfa.html` in a browser (double-click or drag into the browser). No build required.
2. Use the browser console to observe runtime errors and to call helper functions (e.g., `openAuthModal()`).
3. Verify interactivity: opening the auth modal, switching tabs, adding items (if product JS exists), and cart count updates.

## Example edits (concrete, copyable)

- To wire a new login handler in-page, find `loginUser()` in the file and update it to set `localStorage.setItem('user', JSON.stringify({name:..., email:...}))` and then call a helper `updateAuthUI()` that toggles `authContainer`/`userContainer` visibility.
- To add an external script file instead of inline JS, create `site.js` next to `anasayfa.html` and add before `</body>`: `<script src="site.js"></script>`; keep changes minimal and reference DOM IDs listed above.

## Patterns and conventions observed

- Single-file SPA: styling is in `<style>` inside `anasayfa.html`, markup references vanilla JS functions — prefer DOM-first edits.
- Progressive enhancement: interactive elements are plain HTML with JS hooks; ensure accessibility attributes are preserved when changing buttons/links.
- Animation and 3D transforms are applied via CSS classes on `.product-card` and `.product-image` — preserve these classes when refactoring product markup.

## If you merge existing agent instructions

- If a `.github/copilot-instructions.md` already exists, merge by preserving any custom rules and append the "What matters" and "How to test" sections above. I did not find an existing file in this repo.

## Questions for the maintainer

- When you said "kodu bu siteye entegre et" — which code should be integrated? (a script file, a widget, a payment/cart backend?)
- Should new JavaScript be inline or kept as a separate `site.js` file next to `anasayfa.html`?

Please review this and tell me which code you want integrated or whether you want me to proceed by adding a specific script file and wiring it into `anasayfa.html`.
