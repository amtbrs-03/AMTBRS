# /lib - Shared Utilities

**Shared code library for anasayfa.html and /admin/**

## 📚 Modules

### cache.js
Memory cache wrapper for localStorage operations
```javascript
import { getCached, setCached, clearCache } from '../lib/cache.js';

// Get cached value (or fetch from localStorage)
const user = getCached('currentUser');

// Set cached value (and localStorage)
setCached('currentUser', userData);

// Clear cache
clearCache('currentUser');  // specific key
clearCache();              // all cache
```

### mojibake.js
Turkish character encoding fix
```javascript
import { initMojibakeFix } from '../lib/mojibake.js';

// Initialize on page load
initMojibakeFix();
```

### index.js
Main export point for all shared utilities
```javascript
import { getCached, setCached, initMojibakeFix, initializeSharedLibrary } from '../lib/index.js';

// Or initialize everything
initializeSharedLibrary();
```

## 📈 Benefits

- **DRY**: Single source of truth for shared code
- **Maintainability**: -50% duplicate code
- **Performance**: Shared module only loaded once
- **Size**: Reduced duplication overhead

## 🔄 Usage in anasayfa.html

```html
<script type="module">
  import { getCached, setCached, initMojibakeFix } from './lib/index.js';
  
  // Use shared functions
  const user = getCached('currentUser');
  initMojibakeFix();
</script>
```

## 🔄 Usage in /admin/index.html

```html
<script type="module">
  import { getCached, setCached, initMojibakeFix } from '../lib/index.js';
  
  // Use shared functions (relative path: ../)
  const user = getCached('currentUser');
  initMojibakeFix();
</script>
```

## 🎯 Future Additions

- `lib/auth.js` - Login, register, validation
- `lib/api.js` - GitHub API wrapper
- `lib/styles.css` - Shared CSS (DRY)
- `lib/utils.js` - Helper functions

---

**Created**: 21 Aralık 2025  
**Version**: 1.0  
**Status**: Core utilities extracted
