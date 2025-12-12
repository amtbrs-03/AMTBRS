export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // Allow only our site in production; adjust as needed
    // CORS: yelpaze genişlet — origin geldiyse geri yansıt, yoksa * kullan
    // Bilinen barındırmalar için regex tutulmaya devam ediliyor ancak izin verici politika öncelikli.
    const allowed = [
      /^https?:\/\/(www\.)?ern-cicek\.com\.tr$/i,
      /^https?:\/\/amtbrs-03\.github\.io(?:\/.*)?$/i,
      /^https?:\/\/ern-site\.amtbrs-03\.workers\.dev$/i,
      /^https?:\/\/localhost(?::\d+)?$/i
    ];
    const allowOrigin = origin || '*';

    // CORS Preflight - must handle ALL paths
    if (request.method === 'OPTIONS') {
      console.log('✓ OPTIONS preflight request for:', path);
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowOrigin, request)
      });
    }

    try {
      // Ana sayfa - hoş geldiniz mesajı
      if (path === '/' && request.method === 'GET') {
        return new Response('🌸 ERN-ÇİÇEK API - Aktif ve çalışıyor!', { 
          status: 200, 
          headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
        });
      }
      
      // Health check endpoint
      if (path === '/send-order' && request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, message: 'Worker is running' }), { 
          status: 200, 
          headers: jsonHeaders(allowOrigin) 
        });
      }

      if (path === '/send-order' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        // Support both nested order object and flat structure
        const orderId = payload?.order?.id || `ORD-${Date.now()}`;
        // Normalize order structure - handle both odeme.html (flat) and other sources (nested)
        const order = {
          id: orderId,
          date: Date.now(),
          customerEmail: payload?.order?.customerEmail || payload?.customerEmail || payload?.payerEmail || '',
          customerName: payload?.order?.customerName || payload?.customerName || 'Misafir',
          customerPhone: payload?.order?.customerPhone || payload?.customerPhone || '',
          address: payload?.order?.address || payload?.address || '',
          iban: payload?.order?.iban || payload?.iban || '',
          status: 'pending',
          items: Array.isArray(payload?.order?.items) ? payload.order.items : (Array.isArray(payload?.cart) ? payload.cart : []),
          total: payload?.order?.total || payload?.total || '0'
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
              const headRes = await fetch(apiUrl + `?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } });
              if (headRes.ok) { const j = await headRes.json(); existingSha = j.sha; }
            } catch (_) {}
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(order, null, 2))));
            const body = { message: `feat(order): create ${orderId}`, content, branch };
            if (existingSha) body.sha = existingSha;
            const putRes = await fetch(apiUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' }, body: JSON.stringify(body) });
            commitStatus = putRes.status;
            if (putRes.ok) commitOk = true; else commitError = await safeText(putRes);
          }
        } catch (e) {
          commitError = (e && e.message) ? e.message : String(e);
        }
        // Attempt email notification via Resend if order was committed
        let emailOk = false, emailError = null;
        let customerEmailOk = false, customerEmailError = null;
        if (commitOk) {
          try {
            const toEmail = env.TO_EMAIL || '';
            const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
            const resendKey = env.RESEND_API_KEY || '';
            if (toEmail && resendKey) {
              // 1. Satıcıya bildirim e-postası
              const emailBody = `
Yeni Sipariş Received! 🎉

Sipariş ID: ${orderId}
Müşteri: ${order.customerName}
Email: ${order.customerEmail}
Telefon: ${order.customerPhone}

Adres: ${order.address}
IBAN: ${order.iban}

Ürünler:
${order.items.map((item, i) => `  ${i + 1}. ${item.name} - ${item.qty || item.quantity || 1}x @ ₺${item.price}`).join('\n')}

Toplam: ${order.total}

Tarih: ${new Date(order.date).toLocaleString('tr-TR')}
Status: ${order.status}

---
Yönetim Paneli: https://ern-cicek.com.tr/admin.html
              `.trim();
              const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: fromEmail,
                  to: toEmail,
                  subject: `Yeni Sipariş: ${orderId}`,
                  text: emailBody
                })
              });
              if (emailRes.ok) {
                emailOk = true;
                const emailData = await emailRes.json();
                console.log('✅ Email sent via Resend:', emailData);
              } else {
                emailError = await safeText(emailRes);
                console.log('❌ Email send failed:', emailRes.status, emailError);
              }
              
              // 2. Müşteriye sipariş onay e-postası
              if (order.customerEmail && order.customerEmail !== 'misafir@ern-cicek.com') {
                try {
                  const itemsList = order.items.map((item, i) => 
                    `  • ${item.name} - ${item.qty || item.quantity || 1} adet @ ₺${item.price}`
                  ).join('\n');
                  
                  const customerEmailBody = `
Sayın ${order.customerName},

Siparişiniz başarıyla alındı! 🌸

Sipariş Numaranız: ${orderId}

Satın Aldığınız Ürünler:
${itemsList}

Toplam Tutar: ₺${order.total}

Teslimat Adresi:
${order.address || 'Belirtilmedi'}

Ödemeniz gerçekleştikten sonra ürünleriniz kargoyla adresinize gönderilecektir.

Sorularınız için bize WhatsApp üzerinden ulaşabilirsiniz: +90 538 417 90 81

Bizi tercih ettiğiniz için teşekkür ederiz! 🌺

Saygılarımızla,
ERN-ÇİÇEK Ekibi
https://ern-cicek.com.tr
                  `.trim();
                  
                  const customerRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${resendKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      from: fromEmail,
                      to: order.customerEmail,
                      subject: `Siparişiniz Alındı - ${orderId} | ERN-ÇİÇEK`,
                      text: customerEmailBody
                    })
                  });
                  
                  if (customerRes.ok) {
                    customerEmailOk = true;
                    const customerData = await customerRes.json();
                    console.log('✅ Customer email sent:', customerData);
                  } else {
                    customerEmailError = await safeText(customerRes);
                    console.log('❌ Customer email failed:', customerRes.status, customerEmailError);
                  }
                } catch (ce) {
                  customerEmailError = (ce && ce.message) ? ce.message : String(ce);
                  console.log('❌ Customer email exception:', customerEmailError);
                }
              }
            }
          } catch (e) {
            emailError = (e && e.message) ? e.message : String(e);
            console.log('❌ Email exception:', emailError);
          }
        }
        const body = JSON.stringify({ ok: true, orderId, commitOk, commitStatus, commitError, emailOk, emailError, customerEmailOk, customerEmailError, order });
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
              const headRes = await fetch(apiUrl + `?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } });
              if (headRes.ok) { const j = await headRes.json(); existingSha = j.sha; }
            } catch (_) {}
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(user, null, 2))));
            const body = { message: `feat(user): update ${safeEmail}`, content, branch };
            if (existingSha) body.sha = existingSha;
            const putRes = await fetch(apiUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker' }, body: JSON.stringify(body) });
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
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
