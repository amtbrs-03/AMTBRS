// Node.js ortamı için fetch ve TextDecoder polyfill

// fetch polyfill
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
}

// TextDecoder polyfill
if (typeof TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}

// Not: node-fetch ve util modülleri Node.js ortamında hazırdır. Eğer node-fetch yüklü değilse, 'npm install node-fetch' komutunu çalıştırın.
