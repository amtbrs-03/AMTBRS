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
  const total = (cart || []).reduce((s,i) => s + ((Number(i.price)||0) * (Number(i.qty)||0)), 0);
  const itemsHtml = (cart || []).map(i => `<li>${escape(i.name)} x${escape(i.qty||1)} @ ₺${Number(i.price||0).toFixed(2)}</li>`).join('');
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
      subject: 'Havale bildirimi - yeni sipariş',
      text: `Yeni havale bildirimi from ${payerEmail} - toplam ₺${total.toFixed(2)}`,
      html
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true })
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
