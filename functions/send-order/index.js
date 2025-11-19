// Example Netlify/Vercel serverless function to send order notification emails.
// This handler uses nodemailer and environment variables for SMTP credentials.
// Deploy: install dependencies (nodemailer) and set the environment variables described in SERVERLESS_EMAIL.md

const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Allow only POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { payerEmail, cart = [], iban } = payload;
  if (!payerEmail) {
    return { statusCode: 400, body: 'Missing payerEmail' };
  }

  // Read SMTP config from env
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = process.env.SMTP_PORT || 587;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const TO_EMAIL = process.env.TO_EMAIL || 'amtbrs@icloud.com';

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { statusCode: 500, body: 'SMTP not configured on server' };
  }

  // Build simple HTML/text message
  const total = (cart || []).reduce((s,i) => s + ((i.price||0) * (i.qty||0)), 0);
  const itemsHtml = (cart || []).map(i => `<li>${escape(i.name)} x${i.qty||1} @ ₺${(i.price||0).toFixed(2)}</li>`).join('');
  const html = `
    <p>Yeni havale/eft bildirimi geldi.</p>
    <p>Gönderen e-posta: ${escape(payerEmail)}</p>
    <p>IBAN: ${escape(iban || '')}</p>
    <p>Sepet içerikleri:</p>
    <ul>${itemsHtml}</ul>
    <p><strong>Toplam: ₺${total.toFixed(2)}</strong></p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: 'Havale bildirimi - yeni sipariş',
      text: `Yeni havale bildirimi from ${payerEmail} - toplam ₺${total.toFixed(2)}`,
      html
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('mail error', err);
    return { statusCode: 502, body: 'Failed to send email' };
  }
};

function escape(s){
  return String(s || '').replace(/[&<>"']/g, function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m];
  });
}
