## Quick Repo Summary

**ERN Çiçek** is a Turkish florist e-commerce site with GitHub-based data storage and Cloudflare Workers serverless backend. The frontend is a vanilla JS single-page app; the backend uses GitHub commits for persistence and Cloudflare Workers for order processing and invoice generation.

### Architecture at a Glance

```
Frontend: anasayfa.html (6.8k+ lines) ←→ GitHub API (user data, cart, orders)
                                    ↓
          site-settings.json, products.json (local config)
                                    ↓
        Cloudflare Worker (index.js 1.6k lines)
                ↓
        Orders → /orders/*.json (GitHub)
        Invoices → Nodemailer + PDF-lib
        Users → /users/*_full.json (GitHub)
```

## Critical Files & Purposes

| File | Role | Scope |
|------|------|-------|
| [anasayfa.html](anasayfa.html) | Main SPA — all UI, auth, cart, product rendering | Frontend |
| [admin.html](admin.html) | Admin panel — order management, user list, settings | Backend UI |
| [cloudflare-worker/src/index.js](cloudflare-worker/src/index.js) | Order processor, invoice generator, GitHub commit wrapper | Serverless |
| [products.json](products.json) | Product catalog (id, name, price, images, stock, sortOrder) | Config |
| [site-settings.json](site-settings.json) | Store contact, shipping, payment (IBAN) details | Config |
| [scripts/normalize-{products,orders}.js](scripts) | Data normalization (sortOrder, encoding fixes) | DevOps |

## Data Flow & Integration Points

### 1. **Auth & User State** (`anasayfa.html` → GitHub)
- **localStorage keys**: `currentUser`, `user_${email}`, `sessionId_${email}`
- **Remote storage**: `/users/${email}_full.json` (GitHub API, `commitFullUserToRepo()`)
- **Session sync**: `checkSessionValidity()`, `checkDeletedUser()` run on page load
- **SSH/HTTPS encoding**: Early mojibake fix at document load to handle Turkish chars (Ü, ü, ç, ş, ğ, etc.)

### 2. **Cart Management** (in-memory + localStorage → GitHub when ordered)
- **localStorage**: `cart_${email}` (line 2001 in `anasayfa.html`)
- **Sync on login**: `syncCartFromSystem(email)` fetches remote cart from `/carts/${email}.json`
- **On checkout**: POST to `site-settings.json:commitEndpoint` (defaults to Cloudflare Worker)

### 3. **Order Processing** (Frontend → Worker → GitHub)
- **Trigger**: User submits `/odeme.html` form → `fetch(site-settings.json.commitEndpoint, {POST order})`
- **Worker**: `POST /send-order` → GitHub commit to `/orders/${orderId}.json` + email notification
- **Invoice**: Worker generates PDF using `pdf-lib` + Noto Sans font
- **Workflows**: GitHub Actions auto-triggers on order commits (`.github/workflows/save-order.yml`)

### 4. **Product Updates** (Catalog Sync)
- **File**: [products.json](products.json) (items array with `{id, name, price, stock, sortOrder, images}`)
- **Normalization**: `npm run normalize:products` or task runner—ensures deterministic sort order
- **Frontend load**: `loadProducts()` (line 1826) fetches and caches to localStorage via `fetchSiteSettings()`
- **Badge**: `"badge": "Yeni"` marks new products; CSS renders via `.product-image::before`

## Key Development Workflows

### Normalize & Deploy

```bash
# Normalize products and orders to fix sorting/encoding
npm run normalize:products
npm run normalize:orders

# Auto-deploy Worker on cloudflare-worker/** changes
git push origin site-release  # triggers CI/CD → wrangler deploy
```

### Local Testing

1. **Frontend**: Double-click `anasayfa.html` in Finder or drag into browser. No build needed.
2. **Worker**: Use `npx wrangler dev cloudflare-worker/` or test via curl
3. **Admin**: Open `admin.html` in browser; click "Admin Panel" button if visible
4. **Browser console**: Call `loginUser()`, `loadProducts()`, `openCart()` directly

### Key GitHub Secrets (for CI/CD)

- `CF_API_TOKEN`, `CF_ACCOUNT_ID` → Cloudflare deploy
- `GITHUB_TOKEN` (auto-provided) → GitHub API commits

## Code Patterns & Conventions

### localStorage Naming
- **User session**: `currentUser` → `{name, email}` (JSON)
- **User auth**: `user_${email}` → full user object with salt/iterations (for PBKDF2 validation)
- **Session ID**: `sessionId_${email}`, `sessionIdUpdatedAt_${email}` → track login freshness
- **Cart**: `cart_${email}` → array of `{id, name, price, quantity}`
- **Products**: `products` → full catalog cache

### Async Patterns
- **fetch caching**: `cache: 'no-store'` to bypass CDN on data endpoints (line 1817)
- **Error handling**: Wrapped in try/catch; failures log to console, UI shows fallback
- **Mojibake fix**: Early normalize script runs in `<head>`, sweeps DOM 3× on load (line 30–60 in `anasayfa.html`)

### DOM References (Validate Before Edits)
```javascript
// Auth modal
#authModal, #authContainer, #userContainer
#loginEmail, #loginPassword, #registerName, #registerEmail, #switchToRegister, #switchToLogin

// Cart UI
#cartBtn, #cartCount, #cartContainer, .cart-item, .cart-item-remove

// Products
.product-card, .product-image, .product-name, .product-price, .product-badge

// General
.modal, .modal-content, .form-content
```

### Function Entry Points (Search Before Editing)
- `openAuthModal()` → show login/register modal
- `closeAuthModal()` → hide and reset form
- `switchTab(tabName)` → swap login ↔ register UI
- `loginUser()` → validate credentials, set localStorage, sync session
- `logout()` → clear session, hide user menu
- `openCart()` → fetch remote cart, update UI
- `loadProducts()` → fetch products.json, hydrate gallery
- `checkSessionValidity()` → validate login freshness on page load

## Editor Directives

### Goal: Keep It Static-First
- Prefer small, non-breaking edits: inline `<script>` blocks or new `.js` files next to `anasayfa.html`
- Do **not** introduce build steps (webpack, esbuild) unless user explicitly requests it
- Do **not** assume Node server; GitHub API is the persistent store

### When Adding Backend Features
- Use Cloudflare Worker (already configured in `wrangler.toml`)
- Commit data to GitHub API (see `cloudflare-worker/src/index.js` for patterns)
- Store secrets in GitHub Actions or Cloudflare env vars, **not** in code
- **No** new npm dependencies without user approval

### Auth & Data Edits
- Before changing `loginUser()`, search for all `localStorage.setItem` / `getItem` calls to ensure consistency
- Before modifying product schema, update both `anasayfa.html` render logic AND `normalize-products.js` sorting
- Before removing a localStorage key, check admin.html, scripts/, and all workflows for references

## Testing & Validation

### Before Commit
1. Open `anasayfa.html` in browser → test auth flow (register, login, logout)
2. Add items to cart → verify localStorage `cart_${email}`
3. Check admin panel → verify order appears in `/orders/` folder
4. Run `npm run normalize:products` → ensure no formatting breaks JSON

### Troubleshooting
- **Mojibake (Ç → Ã§)**: Check if UTF-8 encoding is correct on save; early fix script should handle it
- **Cart not syncing**: Verify `site-settings.json` `commitEndpoint` matches Worker deployment
- **Orders not appearing**: Check GitHub API token in Cloudflare env, verify `GITHUB_OWNER/GITHUB_REPO`
- **Worker deploy fails**: Run `npm run deploy-worker` or check CF_API_TOKEN and account_id in wrangler.toml
