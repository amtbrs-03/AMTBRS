// Cloudflare Workers - send-order endpoint
// Usage:
// 1) Create a new Worker in Cloudflare Dashboard
// 2) Copy this code into the Worker
// 3) Add secrets: GITHUB_TOKEN, GITHUB_OWNER (default: amtbrs-03), GITHUB_REPO (default: AMTBRS), GITHUB_BRANCH (default: site-release)
// 4) Optionally add email API secrets (SENDGRID_API_KEY and TO_EMAIL/FROM_EMAIL) if you want email notifications
// 5) Deploy and set the Worker route to /send-order (e.g., https://siparis-worker.your-domain.workers.dev/send-order)

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 200, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }
    try {
      const payload = await request.json();
      const payerEmail = payload.payerEmail;
      const cart = Array.isArray(payload.cart) ? payload.cart : [];
      const iban = payload.iban || '';
      if (!payerEmail) {
        return json({ ok: false, error: 'Missing payerEmail' }, 400);
      }
      const orderId = 'ORD-' + Date.now();
      const customerName = payload.customerName || payload.name || 'Müşteri';
      const addressStr = buildAddress(payload);
      const items = cart.map(i => ({ id: i.id || i.name || '', name: i.name || '', price: Number(i.price) || 0, qty: Number(i.qty) || 1 }));
      const total = items.reduce((s,i)=> s + i.price * i.qty, 0).toFixed(2);
      const order = { id: orderId, date: Date.now(), customerEmail: payerEmail, customerName, address: addressStr || undefined, iban, items, total, status: 'pending' };

      // 1) Commit to GitHub (orders/<id>.json)
      let commitOk = false; let commitStatus = null; let commitError = null;
      try {
        const token = env.GITHUB_TOKEN;
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        if (token) {
          const path = `orders/${orderId}.json`;
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
          const content = btoa(JSON.stringify(order, null, 2));
          const body = { message: `feat(order): create ${orderId}`, content, branch };
          const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });
          commitStatus = putRes.status;
          if (putRes.ok) commitOk = true; else {
            const txt = await putRes.text();
            commitError = txt || 'Unknown error';
            console.warn('GitHub commit failed', putRes.status, txt);
          }
        }
      } catch (err) {
        console.error('Order commit error', err);
      }

      // 2) Optional: email notification via SendGrid
      let emailOk = false;
      if (env.SENDGRID_API_KEY && (env.TO_EMAIL || env.FROM_EMAIL)) {
        try {
          const toEmail = env.TO_EMAIL || 'amtbrs@icloud.com';
          const fromEmail = env.FROM_EMAIL || 'no-reply@ern-cicek.com.tr';
          const subject = `Havale bildirimi - yeni sipariş (${orderId})`;
          const text = `Yeni havale bildirimi from ${payerEmail} - toplam ₺${total}`;
          const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: toEmail }] }],
              from: { email: fromEmail },
              subject,
              content: [{ type: 'text/plain', value: text }]
            })
          });
          emailOk = resp.ok;
        } catch (e) {
          console.warn('Email send failed', e);
        }
      }

      return json({ ok: true, orderId, commitOk, commitStatus, commitError, emailOk });
    } catch (err) {
      console.error('Worker error', err);
      return json({ ok: false, error: 'Server error' }, 500);
    }
  }
};

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}
function json(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}
function buildAddress(p){
  const parts = [];
  if (p.address) parts.push(p.address);
  if (p.city) parts.push(p.city);
  if (p.district) parts.push(p.district);
  if (p.neighborhood) parts.push(p.neighborhood);
  if (p.addressDetail) parts.push(p.addressDetail);
  if (p.postalCode) parts.push('PK: ' + p.postalCode);
  return parts.filter(Boolean).join(', ');
}
