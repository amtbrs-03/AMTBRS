# Performance Improvements for AMTBRS Website

This document identifies performance issues in the codebase and provides suggestions for improvements.

## Summary

The AMTBRS website is a static single-page application for a flower shop. While functional, several inefficiencies have been identified that could slow down page load times and increase resource consumption.

---

## Issues Identified

### 1. Duplicate Function Definitions

**Location:** `anasayfa.html`

**Problem:** The `openBank()` function is defined twice (around lines 3154-3156), which wastes memory and can cause confusion:

```javascript
// Line 3154
function openBank(){ document.getElementById('bankModal').style.display = 'block'; }
// Line 3155
function openBank(){ document.getElementById('bankModal').style.display = 'block'; try{ const b = document.getElementById('paymentOpenBtn'); if (b) b.setAttribute('aria-expanded','true'); }catch(e){} }
```

**Fix:** Remove the first duplicate definition and keep only the more complete one.

---

### 2. Double Authentication Check in addToCart

**Location:** `anasayfa.html` (lines 2731-2739)

**Problem:** The `openAuthModal()` is called twice when user is not logged in:

```javascript
function addToCart(item) {
    const user = getCurrentUser();
    if (!user) {
        openAuthModal();
        // user not logged in; open auth modal silently
        openAuthModal();  // <-- DUPLICATE CALL
        console.log('Kullanıcı giriş yapmalı: sepete ekleme engellendi.');
        return;
    }
    // ...
}
```

**Fix:** Remove the duplicate `openAuthModal()` call.

---

### 3. Redundant Event Delegation Listeners

**Location:** `anasayfa.html`

**Problem:** Two separate document click listeners handle the same `data-action` attributes:
- Primary handler at line ~3224
- `extendDelegation()` IIFE at line ~3416

Both listeners process the same click events, causing unnecessary overhead.

**Suggestion:** Consolidate into a single event delegation handler.

---

### 4. Multiple TreeWalker Sweeps for Mojibake Normalization

**Location:** `anasayfa.html`, `admin.html`

**Problem:** The `sweep()` function for fixing mojibake characters:
- Runs immediately on page load
- Runs again on DOMContentLoaded
- Runs 2-5 additional times via setInterval

This causes the entire DOM text to be traversed multiple times unnecessarily.

```javascript
function run(){ sweep(); let c=0; const timer=setInterval(()=>{ sweep(); if(++c>2){ clearInterval(timer); reveal(); } },150); }
```

**Suggestion:**
- Use a MutationObserver to only process newly added text nodes
- Cache whether text has been processed using a WeakSet or data attribute
- Reduce interval sweeps to 1-2 maximum

---

### 5. Repeated DOM Element Lookups

**Location:** Multiple functions throughout `anasayfa.html`

**Problem:** Same DOM elements are queried multiple times without caching:

```javascript
// In renderCart() - gets elements each time
const itemsEl = document.getElementById('cartItems');
const emptyEl = document.getElementById('emptyCart');
const totalEl = document.getElementById('cartTotal');
```

**Suggestion:** Cache frequently accessed DOM elements at initialization:

```javascript
const DOM = {
    cartItems: document.getElementById('cartItems'),
    emptyCart: document.getElementById('emptyCart'),
    cartTotal: document.getElementById('cartTotal'),
    // ... other elements
};
```

---

### 6. Synchronous localStorage Operations in Hot Paths

**Location:** Cart operations (`loadCart()`, `saveCart()`)

**Problem:** localStorage is accessed synchronously on every cart operation, which blocks the main thread.

**Suggestion:** Consider debouncing save operations:

```javascript
let saveCartTimeout;
function saveCart(cart) {
    clearTimeout(saveCartTimeout);
    saveCartTimeout = setTimeout(() => {
        localStorage.setItem(cartKeyForUser(user.email), JSON.stringify(cart));
        // ... rest of save logic
    }, 100);
}
```

---

### 7. Large Inline CSS and JavaScript

**Location:** `anasayfa.html` (~3600 lines), `admin.html` (~4700 lines)

**Problem:** All CSS and JavaScript is inline in HTML files, which:
- Makes parsing slower
- Prevents separate caching
- Causes larger initial HTML payload

**Suggestion (Future):** Extract CSS to `styles.css` and JavaScript to `site.js` or `admin.js`:

```html
<link rel="stylesheet" href="styles.css">
<script src="site.js" defer></script>
```

---

### 8. Inefficient Product Card Rendering

**Location:** `renderProducts()` function in `anasayfa.html`

**Problem:** Each product creates new DOM elements via innerHTML, which is slower than using document fragments.

**Suggestion:** Use DocumentFragment for batch DOM insertions:

```javascript
function renderProducts(products) {
    const container = document.querySelector('.products');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    
    products.forEach(p => {
        const card = document.createElement('div');
        // ... build card
        fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}
```

---

### 9. Unnecessary Try-Catch Wrapping

**Location:** Multiple functions

**Problem:** Many functions wrap every operation in try-catch unnecessarily, even for safe operations, adding overhead:

```javascript
try{ const b = document.getElementById('cartBtn'); if (b) b.setAttribute('aria-expanded','false'); }catch(e){}
```

**Suggestion:** Only wrap operations that could actually throw exceptions.

---

### 10. Redundant GitHub Token Check Functions

**Location:** `admin.html`

**Problem:** `getGitHubToken()` is defined multiple times with fallback logic, and there's also an early stub definition.

**Suggestion:** Define once at the top and use consistently throughout.

---

## Priority Fixes

### Completed ✅
1. Remove duplicate `openBank()` definition
2. Remove duplicate `openAuthModal()` call in `addToCart()`
3. Fix broken `checkAllButtons()` function structure

### High Priority (Should Fix Now)
4. Consolidate event delegation handlers

### Medium Priority (Recommended)
5. Cache DOM element references
6. Reduce mojibake sweep intervals
7. Use debouncing for localStorage saves

### Low Priority (Future Optimization)
8. Extract CSS/JS to separate files
9. Use DocumentFragment for batch rendering
10. Implement service worker for caching

---

## Quick Wins Applied

The following issues have been fixed in this commit:

1. **Duplicate `openBank()` definition** - Removed redundant function definition
2. **Double `openAuthModal()` call** - Removed duplicate invocation in `addToCart()`
3. **Broken `checkAllButtons()` function** - Fixed malformed function structure where nested functions were accidentally placed inside

---

## Measuring Performance

To measure the impact of these changes, you can use:

1. **Chrome DevTools Performance tab** - Record page load
2. **Lighthouse** - Run performance audit
3. **Web Vitals** - Measure LCP, FID, CLS

```javascript
// Add to page for debugging
new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        console.log(entry.name, entry.startTime, entry.duration);
    }
}).observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
```

---

*Last updated: December 2024*
