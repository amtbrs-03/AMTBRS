#!/usr/bin/env node
/*
 Safe environment diagnostics for AMTBRS repo
 Prints only non-sensitive values directly and token/url lengths for sensitive entries.
*/

const names = [
  'CF_API_TOKEN',
  'CF_ACCOUNT_ID',
  'WORKER_URL',
  'WORKER_GITHUB_TOKEN',
  'WORKER_GITHUB_OWNER',
  'WORKER_GITHUB_REPO',
  'WORKER_GITHUB_BRANCH',
];

const isSensitive = new Set([
  'CF_API_TOKEN',
  'WORKER_GITHUB_TOKEN',
  'WORKER_URL', // treat URL as sensitive to avoid leaking endpoints unexpectedly
]);

function fmt(name, val) {
  if (val == null) return `${name}: (not set)`;
  if (isSensitive.has(name)) {
    const len = String(val).length;
    return `${name}: (set) length=${len}`;
  }
  return `${name}: ${val}`;
}

for (const n of names) {
  console.log(fmt(n, process.env[n]));
}

// Exit non-zero if critical secrets appear missing (optional)
const missingCritical = ['CF_API_TOKEN', 'WORKER_GITHUB_TOKEN'].filter(n => !process.env[n]);
if (missingCritical.length) {
  // Do not fail hard; just warn to avoid breaking CI accidentally
  console.error('Warning: missing critical secrets ->', missingCritical.join(', '));
}
