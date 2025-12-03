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
        const body = JSON.stringify({ commitOk: true, orderId });
        return new Response(body, { status: 200, headers: jsonHeaders(allowOrigin) });
      }

      if (path === '/update-user' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        // TODO: Commit user update to GitHub if needed using env bindings
        const body = JSON.stringify({ commitOk: true });
        return new Response(body, { status: 200, headers: jsonHeaders(allowOrigin) });
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
