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
          note: payload?.order?.note || payload?.note || '',
          noteRead: false,
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
              const noteSection = order.note ? `\n📝 MÜŞTERİ NOTU:\n${order.note}\n` : '';
              const emailBody = `
Yeni Sipariş Received! 🎉

Sipariş ID: ${orderId}
Müşteri: ${order.customerName}
Email: ${order.customerEmail}
Telefon: ${order.customerPhone}
${noteSection}
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

Bizi tercih ettiğiniz için teşekkür ederiz! 🌿

Saygılarımızla,
🌿 ERN Tropikal Çiçek
https://ern-cicek.com.tr
                  `.trim();
                  
                  // HTML version for better presentation
                  const itemsHtml = order.items.map((item) => 
                    `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${item.name}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.qty || item.quantity || 1}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">₺${item.price}</td></tr>`
                  ).join('');
                  
                  const customerEmailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f6f3;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0b2f1f,#1a4a35);color:white;padding:30px;text-align:center;">
      <div style="display:inline-block;margin-bottom:10px;">
        <span style="font-size:32px;font-weight:800;letter-spacing:1px;text-shadow:0 2px 4px rgba(0,0,0,0.2);">🌿 ERN</span>
        <span style="font-size:18px;font-weight:500;opacity:0.9;margin-left:4px;">ÇİÇEK</span>
      </div>
      <p style="margin:10px 0 0;opacity:0.9;font-size:16px;">✅ Siparişiniz Alındı!</p>
    </div>
    <div style="padding:30px;">
      <p style="color:#475569;font-size:16px;">Sayın <strong>${order.customerName}</strong>,</p>
      <p style="color:#475569;">Siparişiniz başarıyla oluşturuldu. Aşağıda sipariş detaylarınızı bulabilirsiniz.</p>
      
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:15px;margin:20px 0;">
        <p style="margin:0;color:#166534;font-weight:600;">✅ Sipariş Numarası: ${orderId}</p>
      </div>
      
      <h3 style="color:#0b2f1f;margin:20px 0 10px;">📦 Sipariş Detayları</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:10px;text-align:left;color:#475569;">Ürün</th>
            <th style="padding:10px;text-align:center;color:#475569;">Adet</th>
            <th style="padding:10px;text-align:right;color:#475569;">Fiyat</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#0b2f1f;color:white;">
            <td colspan="2" style="padding:12px;font-weight:600;">TOPLAM</td>
            <td style="padding:12px;text-align:right;font-weight:600;">₺${order.total}</td>
          </tr>
        </tfoot>
      </table>
      
      <h3 style="color:#0b2f1f;margin:25px 0 10px;">📍 Teslimat Adresi</h3>
      <p style="color:#475569;background:#f8fafc;padding:15px;border-radius:8px;margin:0;">${order.address || 'Belirtilmedi'}</p>
      
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:15px;margin:25px 0;">
        <p style="margin:0;color:#92400e;font-size:14px;">💳 <strong>Önemli:</strong> Ödemeniz gerçekleştikten sonra ürünleriniz kargoyla adresinize gönderilecektir.</p>
      </div>
      
      <p style="color:#475569;margin-top:25px;">Sorularınız için bize ulaşabilirsiniz:</p>
      <p style="margin:5px 0;"><a href="https://wa.me/905384179081" style="color:#16a34a;text-decoration:none;">📱 WhatsApp: +90 538 417 90 81</a></p>
      <p style="margin:5px 0;"><a href="mailto:amtbrs@icloud.com" style="color:#2563eb;text-decoration:none;">📧 Email: amtbrs@icloud.com</a></p>
      
<p style="color:#475569;margin-top:30px;">Bizi tercih ettiğiniz için teşekkür ederiz! 🌿</p>
      <p style="color:#0b2f1f;font-weight:600;">🌿 ERN Tropikal Çiçek</p>
    </div>
    <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">© 2025 ERN-ÇİÇEK — <a href="https://ern-cicek.com.tr" style="color:#16a34a;">ern-cicek.com.tr</a></p>
    </div>
  </div>
</body>
</html>`.trim();
                  
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
                      text: customerEmailBody,
                      html: customerEmailHtml
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

      // Generic commit endpoint for cart snapshots and other files
      if (path === '/commit' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const files = payload?.files || [];
        const message = payload?.message || 'chore: auto commit';
        
        if (!Array.isArray(files) || files.length === 0) {
          return new Response(JSON.stringify({ ok: false, error: 'No files provided' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;
        
        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'GitHub token not configured' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const results = [];
        for (const file of files) {
          const filePath = file.path;
          const content = file.contentBase64 || file.content;
          if (!filePath || !content) continue;
          
          try {
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
            
            // Check if file exists to get SHA
            let existingSha = null;
            try {
              const headRes = await fetch(apiUrl + `?ref=${branch}`, { 
                headers: { 
                  Authorization: `Bearer ${token}`, 
                  Accept: 'application/vnd.github+json', 
                  'User-Agent': 'Cloudflare-Worker' 
                } 
              });
              if (headRes.ok) { 
                const j = await headRes.json(); 
                existingSha = j.sha; 
              }
            } catch (_) {}
            
            const putBody = { message, content, branch };
            if (existingSha) putBody.sha = existingSha;
            
            const putRes = await fetch(apiUrl, { 
              method: 'PUT', 
              headers: { 
                Authorization: `Bearer ${token}`, 
                Accept: 'application/vnd.github+json', 
                'Content-Type': 'application/json', 
                'User-Agent': 'Cloudflare-Worker' 
              }, 
              body: JSON.stringify(putBody) 
            });
            
            results.push({ path: filePath, ok: putRes.ok, status: putRes.status });
          } catch (e) {
            results.push({ path: filePath, ok: false, error: e.message });
          }
        }
        
        const allOk = results.every(r => r.ok);
        return new Response(JSON.stringify({ ok: allOk, results }), { 
          status: allOk ? 200 : 207, 
          headers: jsonHeaders(allowOrigin) 
        });
      }

      // Sipariş Hazır - Müşteriye bildirim e-postası gönder
      if (path === '/order-ready' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const order = payload?.order || payload || {};
        const invoiceHtml = payload?.invoiceHtml || order.invoiceHtml || '';
        
        const orderId = order.id || order.orderId || '';
        const customerEmail = order.customerEmail || '';
        const customerName = order.customerName || 'Değerli Müşterimiz';
        const address = order.address || 'Belirtilmedi';
        const items = Array.isArray(order.items) ? order.items : [];
        const total = order.total || '0';
        
        if (!customerEmail || !orderId) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing orderId or customerEmail' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        let emailOk = false, emailError = null;
        
        try {
          const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
          const resendKey = env.RESEND_API_KEY || '';
          
          if (!resendKey) {
            return new Response(JSON.stringify({ ok: false, error: 'Resend API key not configured' }), { 
              status: 500, headers: jsonHeaders(allowOrigin) 
            });
          }
          
          // Ürün listesi HTML
          const itemsHtml = items.map((item) => 
            `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${item.name}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.qty || item.quantity || 1}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">₺${item.price}</td></tr>`
          ).join('');
          
          const orderReadyHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f6f3;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0b2f1f,#1a4a35);color:white;padding:30px;text-align:center;">
      <div style="display:inline-block;margin-bottom:10px;">
        <span style="font-size:32px;font-weight:800;letter-spacing:1px;text-shadow:0 2px 4px rgba(0,0,0,0.2);">🌿 ERN</span>
        <span style="font-size:18px;font-weight:500;opacity:0.9;margin-left:4px;">ÇİÇEK</span>
      </div>
      <p style="margin:10px 0 0;opacity:0.9;font-size:16px;">📦 Siparişiniz Hazırlandı!</p>
    </div>
    
    <!-- Yeşil başarı kutusu -->
    <div style="background:#10b981;padding:25px;text-align:center;">
      <div style="display:inline-block;width:60px;height:60px;background:white;border-radius:50%;line-height:60px;margin-bottom:15px;">
        <span style="font-size:32px;color:#10b981;">✓</span>
      </div>
      <h2 style="color:white;margin:0;font-size:22px;font-weight:600;">Siparişiniz Hazır!</h2>
      <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:15px;">Ürünleriniz özenle paketlendi ve kargoya verilmeye hazır.</p>
    </div>
    
    <div style="padding:30px;">
      <p style="color:#475569;font-size:16px;">Sayın <strong>${customerName}</strong>,</p>
      <p style="color:#475569;">Siparişiniz başarıyla hazırlandı ve en kısa sürede kargoya verilecektir.</p>
      
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:15px;margin:20px 0;">
        <p style="margin:0;color:#166534;font-weight:600;">📦 Sipariş Numarası: ${orderId}</p>
      </div>
      
      <h3 style="color:#0b2f1f;margin:25px 0 10px;">🛒 Sipariş İçeriği</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:12px;text-align:left;color:#475569;font-weight:600;">Ürün</th>
            <th style="padding:12px;text-align:center;color:#475569;font-weight:600;">Adet</th>
            <th style="padding:12px;text-align:right;color:#475569;font-weight:600;">Fiyat</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#10b981;color:white;">
            <td colspan="2" style="padding:14px;font-weight:700;font-size:16px;">TOPLAM</td>
            <td style="padding:14px;text-align:right;font-weight:700;font-size:16px;">₺${total}</td>
          </tr>
        </tfoot>
      </table>
      
      <h3 style="color:#0b2f1f;margin:25px 0 10px;">📍 Teslimat Adresi</h3>
      <p style="color:#475569;background:#f8fafc;padding:15px;border-radius:8px;margin:0;border-left:4px solid #10b981;">${address}</p>
      
      <div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:15px;margin:25px 0;">
        <p style="margin:0;color:#1e40af;font-size:14px;">🚚 <strong>Kargo Bilgisi:</strong> Kargo takip numaranız ayrıca SMS ve e-posta ile iletilecektir.</p>
      </div>
      
      <div style="margin:25px 0;padding:20px;background:#f0fdf4;border:2px solid #10b981;border-radius:12px;text-align:center;">
        <h3 style="color:#064e3b;margin:0 0 15px 0;">📄 Bilgi Fişiniz Hazır</h3>
        <p style="color:#475569;font-size:14px;margin:0 0 20px 0;">Siparişinize ait bilgi fişini aşağıdaki butona tıklayarak görüntüleyebilir, yazdırabilir veya PDF olarak kaydedebilirsiniz.</p>
        <a href="https://ern-cicek.com.tr/bilgifisleri.html" style="display:inline-block;background:#10b981;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">📥 Bilgi Fişimi Görüntüle</a>
      </div>
      
      <p style="color:#475569;margin-top:25px;">Sorularınız için bize ulaşabilirsiniz:</p>
      <p style="margin:5px 0;"><a href="https://wa.me/905384179081" style="color:#16a34a;text-decoration:none;">📱 WhatsApp: +90 538 417 90 81</a></p>
      <p style="margin:5px 0;"><a href="mailto:amtbrs@icloud.com" style="color:#2563eb;text-decoration:none;">📧 Email: amtbrs@icloud.com</a></p>
      
      <p style="color:#475569;margin-top:30px;">Bizi tercih ettiğiniz için teşekkür ederiz! 🌿</p>
      <p style="color:#0b2f1f;font-weight:600;">🌿 ERN Tropikal Çiçek</p>
    </div>
    <div style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">© 2025 ERN-ÇİÇEK — <a href="https://ern-cicek.com.tr" style="color:#16a34a;">ern-cicek.com.tr</a></p>
    </div>
  </div>
</body>
</html>`.trim();

          const orderReadyText = `
Sayın ${customerName},

✅ SİPARİŞİNİZ HAZIRLANDI!

Sipariş Numarası: ${orderId}

Ürünleriniz özenle paketlendi ve en kısa sürede kargoya verilecektir.

Sipariş İçeriği:
${items.map((item, i) => `  ${i + 1}. ${item.name} - ${item.qty || item.quantity || 1} adet @ ₺${item.price}`).join('\n')}

Toplam: ₺${total}

Teslimat Adresi:
${address}

Kargo takip numaranız ayrıca SMS ve e-posta ile iletilecektir.

Sorularınız için:
📱 WhatsApp: +90 538 417 90 81
📧 Email: amtbrs@icloud.com

Bizi tercih ettiğiniz için teşekkür ederiz! 🌿

Saygılarımızla,
ERN Tropikal Çiçek
https://ern-cicek.com.tr
          `.trim();
          
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: fromEmail,
              to: customerEmail,
              subject: `✅ Siparişiniz Hazırlandı - ${orderId} | ERN-ÇİÇEK`,
              text: orderReadyText,
              html: orderReadyHtml
            })
          });
          
          if (emailRes.ok) {
            emailOk = true;
            const emailData = await emailRes.json();
            console.log('✅ Order ready email sent:', emailData);
          } else {
            emailError = await safeText(emailRes);
            console.log('❌ Order ready email failed:', emailRes.status, emailError);
          }
        } catch (e) {
          emailError = (e && e.message) ? e.message : String(e);
          console.log('❌ Order ready email exception:', emailError);
        }
        
        return new Response(JSON.stringify({ ok: emailOk, emailOk, emailError }), { 
          status: emailOk ? 200 : 500, 
          headers: jsonHeaders(allowOrigin) 
        });
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
            const filePath = `users/${safeEmail}_full.json`;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
            
            // Retry loop for 409 conflicts
            for (let attempt = 0; attempt < 3; attempt++) {
              // Get current SHA
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
              
              if (putRes.ok) {
                commitOk = true;
                break;
              } else if (putRes.status === 409 && attempt < 2) {
                // Conflict - retry with fresh SHA
                await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
                continue;
              } else {
                commitError = await safeText(putRes);
                break;
              }
            }
          } else {
            commitError = 'missing token';
          }
        } catch (e) {
          commitError = (e && e.message) ? e.message : String(e);
        }
        const body = JSON.stringify({ commitOk, commitStatus, commitError });
        return new Response(body, { status: commitOk ? 201 : 200, headers: jsonHeaders(allowOrigin) });
      }

      // Sepet silme endpoint'i - müşteri sepetini temizlediğinde çağrılır
      if (path === '/delete-cart' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const email = ((payload && payload.email) || '').toLowerCase().trim();
        
        if (!email) {
          return new Response(JSON.stringify({ ok: false, error: 'missing email' }), { 
            status: 400, 
            headers: jsonHeaders(allowOrigin) 
          });
        }
        
        let deleteOk = false, deleteError = null;
        
        try {
          const owner = env.GITHUB_OWNER || 'amtbrs-03';
          const repo = env.GITHUB_REPO || 'AMTBRS';
          const branch = env.GITHUB_BRANCH || 'site-release';
          const token = env.GITHUB_TOKEN || env.GH_TOKEN;
          
          if (!token) {
            return new Response(JSON.stringify({ ok: false, error: 'missing token' }), { 
              status: 500, 
              headers: jsonHeaders(allowOrigin) 
            });
          }
          
          const safeEmail = email.replace(/[^a-z0-9._@-]/gi, '_');
          const filePath = `carts/${safeEmail}.json`;
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
          
          // Önce dosyanın SHA'sini al
          const headRes = await fetch(apiUrl + `?ref=${branch}`, { 
            headers: { 
              Authorization: `Bearer ${token}`, 
              Accept: 'application/vnd.github+json', 
              'User-Agent': 'Cloudflare-Worker' 
            } 
          });
          
          if (!headRes.ok) {
            // Dosya zaten yok
            console.log('[delete-cart] Sepet dosyası zaten yok:', email);
            return new Response(JSON.stringify({ ok: true, message: 'cart already deleted' }), { 
              status: 200, 
              headers: jsonHeaders(allowOrigin) 
            });
          }
          
          const headData = await headRes.json();
          const sha = headData.sha;
          
          // Dosyayı sil
          const delRes = await fetch(apiUrl, {
            method: 'DELETE',
            headers: { 
              Authorization: `Bearer ${token}`, 
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json', 
              'User-Agent': 'Cloudflare-Worker' 
            },
            body: JSON.stringify({
              message: `chore: cart cleared ${safeEmail}`,
              sha: sha,
              branch: branch
            })
          });
          
          if (delRes.ok) {
            deleteOk = true;
            console.log('[delete-cart] ✅ Sepet silindi:', email);
          } else {
            deleteError = await safeText(delRes);
            console.log('[delete-cart] ❌ Silme başarısız:', delRes.status, deleteError);
          }
        } catch (e) {
          deleteError = (e && e.message) ? e.message : String(e);
        }
        
        return new Response(JSON.stringify({ ok: deleteOk, error: deleteError }), { 
          status: deleteOk ? 200 : 500, 
          headers: jsonHeaders(allowOrigin) 
        });
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
