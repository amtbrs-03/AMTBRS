// Example Netlify/Vercel serverless function to send order notification emails.
// This handler uses nodemailer and environment variables for SMTP credentials.
// Deploy: install dependencies (nodemailer) and set the environment variables described in SERVERLESS_EMAIL.md

const nodemailer = require('nodemailer');
// Optional: googleapis for Gmail OAuth2 flow
let google;
try{ google = require('googleapis').google; }catch(e){ google = null; }

exports.handler = async function(event, context) {
  // CORS headers for browser clients (adjust origin in production)
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  // Respond to CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  // Allow only POST for the main handler
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Invalid JSON' };
  }

  const { payerEmail, cart = [], iban } = payload;
  if (!payerEmail) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Missing payerEmail' };
  }

  // Build order object (single source of truth for commit + email)
  const orderId = 'ORD-' + Date.now();
  const order = {
    id: orderId,
    date: Date.now(),
    payerEmail,
    iban: iban || '',
    items: (cart||[]).map(i=>({ id: i.id||i.name||'', name: i.name||'', price: Number(i.price)||0, qty: Number(i.qty)||1 })),
    total: (cart||[]).reduce((s,i)=> s + ((Number(i.price)||0) * (Number(i.qty)||0)), 0),
    status: 'pending'
  };

  // Read SMTP / Gmail OAuth config from env
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = process.env.SMTP_PORT || 587;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS; // app password fallback
  const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const TO_EMAIL = process.env.TO_EMAIL || 'amtbrs@icloud.com';

  // Gmail OAuth2 variables (preferred for Gmail):
  const GMAIL_OAUTH_CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID;
  const GMAIL_OAUTH_CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const GMAIL_OAUTH_REFRESH_TOKEN = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

  // Validate presence of at least one auth method
  if (!((GMAIL_OAUTH_CLIENT_ID && GMAIL_OAUTH_CLIENT_SECRET && GMAIL_OAUTH_REFRESH_TOKEN && SMTP_USER) || (SMTP_HOST && SMTP_USER && SMTP_PASS))) {
    return { statusCode: 500, headers: CORS_HEADERS, body: 'SMTP or Gmail OAuth not configured on server' };
  }

  // Build simple HTML/text message
  const total = order.total;
  const itemsHtml = order.items.map(i => `<li>${escape(i.name)} x${escape(i.qty||1)} @ ₺${Number(i.price||0).toFixed(2)}</li>`).join('');
  const html = `
    <p>Yeni havale/eft bildirimi geldi.</p>
    <p>Gönderen e-posta: ${escape(payerEmail)}</p>
    <p>IBAN: ${escape(iban || '')}</p>
    <p>Sepet içerikleri:</p>
    <ul>${itemsHtml}</ul>
    <p><strong>Toplam: ₺${total.toFixed(2)}</strong></p>
  `;

  try {
    let transporter;

    // If OAuth credentials provided and googleapis available, use Gmail OAuth2
    if (GMAIL_OAUTH_CLIENT_ID && GMAIL_OAUTH_CLIENT_SECRET && GMAIL_OAUTH_REFRESH_TOKEN && google) {
      try{
        const oauth2Client = new google.auth.OAuth2(
          GMAIL_OAUTH_CLIENT_ID,
          GMAIL_OAUTH_CLIENT_SECRET,
          'https://developers.google.com/oauthplayground'
        );
        oauth2Client.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN });
        // get access token (may return Promise or object)
        const accessTokenObj = await oauth2Client.getAccessToken();
        const accessToken = (accessTokenObj && accessTokenObj.token) ? accessTokenObj.token : (accessTokenObj && typeof accessTokenObj === 'string' ? accessTokenObj : null);

        if (!accessToken) throw new Error('Failed to acquire access token for Gmail OAuth2');

        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: SMTP_USER,
            clientId: GMAIL_OAUTH_CLIENT_ID,
            clientSecret: GMAIL_OAUTH_CLIENT_SECRET,
            refreshToken: GMAIL_OAUTH_REFRESH_TOKEN,
            accessToken
          }
        });
      }catch(err){
        console.error('Gmail OAuth setup failed, falling back to SMTP if available', err);
      }
    }

    // Fallback to plain SMTP (can be Gmail with App Password)
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });
    }

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `Havale bildirimi - yeni sipariş (${orderId})`,
      text: `Yeni havale bildirimi from ${payerEmail} - toplam ₺${total.toFixed(2)}`,
      html
    });

    // Optional GitHub commit (orders/<id>.json) using server-side token.
    let commitOk = false, commitStatus = null;
    try {
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const GITHUB_OWNER = process.env.GITHUB_OWNER || 'amtbrs-03';
      const GITHUB_REPO = process.env.GITHUB_REPO || 'AMTBRS';
      const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'site-release';
      if (GITHUB_TOKEN) {
        const path = `orders/${orderId}.json`;
        const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
        // First check if file exists to avoid collision
        let existingSha = null;
        try {
          const headRes = await fetch(apiUrl + `?ref=${GITHUB_BRANCH}`, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' }
          });
          if (headRes.ok) {
            const j = await headRes.json(); existingSha = j.sha;
          }
        } catch(_){}
        const content = Buffer.from(JSON.stringify(order, null, 2), 'utf8').toString('base64');
        const body = { message: `feat(order): create ${orderId}`, content, branch: GITHUB_BRANCH };
        if (existingSha) body.sha = existingSha; // unlikely, but handle overwrite
        const putRes = await fetch(apiUrl, {
          method: 'PUT',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        commitStatus = putRes.status;
        if (putRes.ok) commitOk = true; else {
          const txt = await putRes.text();
          console.warn('GitHub commit failed', putRes.status, txt);
        }
      } else {
        console.warn('GITHUB_TOKEN not set: skipping order commit');
      }
    } catch (commitErr) {
      console.error('Order commit error', commitErr);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, orderId, commitOk, commitStatus })
    };
  } catch (err) {
    console.error('mail error', err);
    return { statusCode: 502, headers: CORS_HEADERS, body: 'Failed to send email' };
  }
};

function escape(s){
  return String(s || '').replace(/[&<>"']/g, function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m];
  });
}
