export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // Allow only our site in production; adjust as needed
    const allowed = [/^https?:\/\/(www\.)?ern-cicek\.com\.tr$/i];
    const allowOrigin = allowed.some(r => r.test(origin)) ? origin : '*';

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowOrigin, request)
      });
    }

    try {
      if (path === '/send-order' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        // TODO: Commit order to GitHub if needed using env bindings
        const orderId = payload?.order?.id || `ORD-${Date.now()}`;
        // Normalize order structure
        const order = {
          id: orderId,
          date: Date.now(),
          customerEmail: payload?.order?.customerEmail || payload?.body?.email || '',
          customerName: payload?.order?.customerName || 'Misafir',
          address: payload?.order?.address || '',
          iban: payload?.order?.iban || payload?.body?.iban || '',
          status: 'pending',
          items: Array.isArray(payload?.order?.items) ? payload.order.items : (Array.isArray(payload?.body?.items) ? payload.body.items : []),
          total: typeof payload?.order?.total === 'number' ? payload.order.total : 0
        };
        // Attempt GitHub commit if env is configured
        let commitOk = false, commitStatus = null, commitError = null;
        try {
          const owner = env.GITHUB_OWNER || 'amtbrs-03';
          const repo = env.GITHUB_REPO || 'AMTBRS';
          const branch = env.GITHUB_BRANCH || 'site-release';
          const token = env.GITHUB_TOKEN || env.GH_TOKEN;
          if (token) {
            const path = `orders/${orderId}.json`;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
            // check existing
            let existingSha = null;
            try {
              const headRes = await fetch(apiUrl + `?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
              if (headRes.ok) { const j = await headRes.json(); existingSha = j.sha; }
            } catch (_) {}
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(order, null, 2))));
            const body = { message: `feat(order): create ${orderId}`, content, branch };
            if (existingSha) body.sha = existingSha;
            const putRes = await fetch(apiUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            commitStatus = putRes.status;
            if (putRes.ok) commitOk = true; else commitError = await safeText(putRes);
          }
        } catch (e) {
          commitError = (e && e.message) ? e.message : String(e);
        }
        const body = JSON.stringify({ ok: true, orderId, commitOk, commitStatus, commitError, order });
        return new Response(body, { status: commitOk ? 201 : 200, headers: jsonHeaders(allowOrigin) });
      }

      if (path === '/update-user' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        // Expect full user record with email
        const user = (payload && typeof payload === 'object') ? payload : {};
        const email = (user.email || '').toLowerCase();
        let commitOk = false, commitStatus = null, commitError = null;
        if (!email) {
          const body = JSON.stringify({ commitOk: false, commitError: 'missing email' });
          return new Response(body, { status: 400, headers: jsonHeaders(allowOrigin) });
        }
        try {
          const owner = env.GITHUB_OWNER || 'amtbrs-03';
          const repo = env.GITHUB_REPO || 'AMTBRS';
          const branch = env.GITHUB_BRANCH || 'site-release';
          const token = env.GITHUB_TOKEN || env.GH_TOKEN;
          if (token) {
            const safeEmail = email.replace(/[^a-z0-9._@-]/gi, '_');
            const path = `users/${safeEmail}_full.json`;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
            // check existing
            let existingSha = null;
            try {
              const headRes = await fetch(apiUrl + `?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
              if (headRes.ok) { const j = await headRes.json(); existingSha = j.sha; }
            } catch (_) {}
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(user, null, 2))));
            const body = { message: `feat(user): update ${safeEmail}`, content, branch };
            if (existingSha) body.sha = existingSha;
            const putRes = await fetch(apiUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            commitStatus = putRes.status;
            if (putRes.ok) commitOk = true; else commitError = await safeText(putRes);
          } else {
            commitError = 'missing token';
          }
        } catch (e) {
          commitError = (e && e.message) ? e.message : String(e);
        }
        const body = JSON.stringify({ commitOk, commitStatus, commitError });
        return new Response(body, { status: commitOk ? 201 : 200, headers: jsonHeaders(allowOrigin) });
      }

      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      return new Response(JSON.stringify({ commitOk: false, error: msg }), { status: 500, headers: jsonHeaders(allowOrigin) });
    }
  }
}

function corsHeaders(origin, request) {
  const reqMethod = request?.headers?.get('Access-Control-Request-Method');
  const reqHeaders = request?.headers?.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': reqMethod || 'POST, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
  };
}

function jsonHeaders(origin) {
  return { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' };
}

async function readJsonLoose(request) {
  // Accept text/plain (no-preflight) and application/json
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    return await request.json();
  }
  const txt = await request.text();
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}

async function safeText(res) {
  try { return await res.text(); } catch { return null; }
}
