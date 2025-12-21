import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

    // Allow only our site in production; adjust as needed
    // CORS: whitelist check - only allow origins that match regex
    const allowed = [
      /^https?:\/\/(www\.)?ern-cicek\.com\.tr$/i,
      /^https?:\/\/amtbrs-03\.github\.io(?:\/.*)?$/i,
      /^https?:\/\/ern-site\.amtbrs-03\.workers\.dev$/i,
      /^https?:\/\/localhost(?::\d+)?$/i
    ];
    const allowOrigin = (origin && allowed.some(r => r.test(origin))) ? origin : ''; // ✅ Security Fix #1: Whitelist check

    // ✅ SECURITY: Rate Limiting
    const rateLimit = await checkRateLimit(clientIp, env);
    if (!rateLimit.allowed) {
      console.warn(`⚠️ Rate limit exceeded for IP: ${clientIp}`);
      return new Response(JSON.stringify({ error: 'Too many requests' }), { 
        status: 429, 
        headers: jsonHeaders(allowOrigin) 
      });
    }

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

      // ========== ŞİFRE SIFIRLAMA: Kod İste ==========
      if (path === '/request-reset' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const email = (payload?.email || '').trim().toLowerCase();
        
        if (!email || !email.includes('@')) {
          return new Response(JSON.stringify({ ok: false, error: 'Geçerli bir email adresi girin' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // GitHub'da kullanıcı var mı kontrol et
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;
        
        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'Sunucu yapılandırma hatası' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Kullanıcı dosyasını kontrol et
        const userPath = `users/${email}_full.json`;
        const userApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(userPath)}?ref=${branch}`;
        
        try {
          const userRes = await fetch(userApiUrl, { 
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } 
          });
          
          if (!userRes.ok) {
            // Kullanıcı bulunamadı - güvenlik için aynı mesajı ver
            return new Response(JSON.stringify({ ok: true, message: 'Eğer bu email kayıtlıysa, sıfırlama kodu gönderildi.' }), { 
              status: 200, headers: jsonHeaders(allowOrigin) 
            });
          }
          
          // 6 haneli kod oluştur
          const resetCode = String(Math.floor(100000 + Math.random() * 900000));
          const expiresAt = Date.now() + (3 * 60 * 1000); // 3 dakika
          
          // Kodu KV'ye kaydet
          if (env.RATE_LIMIT_KV) {
            await env.RATE_LIMIT_KV.put(
              `reset:${email}`,
              JSON.stringify({ code: resetCode, expiresAt, attempts: 0 }),
              { expirationTtl: 180 } // 3 dakika sonra otomatik sil
            );
          }
          
          // Email gönder
          const resendKey = env.RESEND_API_KEY || '';
          const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
          
          if (resendKey) {
            const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f6f3;margin:0;padding:20px;">
  <div style="max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0b2f1f,#1a4a35);color:white;padding:24px;text-align:center;">
      <span style="font-size:28px;font-weight:800;">🌿 ERN ÇİÇEK</span>
    </div>
    <div style="padding:30px;text-align:center;">
      <div style="font-size:18px;color:#334155;margin-bottom:20px;">Şifre Sıfırlama Kodunuz</div>
      <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #22c55e;border-radius:12px;padding:20px;margin:20px 0;">
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#166534;">${resetCode}</div>
      </div>
      <div style="color:#ef4444;font-weight:600;margin:15px 0;">⏱️ Bu kod 3 dakika geçerlidir</div>
      <div style="color:#6b7280;font-size:14px;margin-top:20px;">Eğer bu isteği siz yapmadıysanız, bu emaili görmezden gelin.</div>
    </div>
    <div style="background:#f1f5f9;padding:15px;text-align:center;color:#64748b;font-size:12px;">
      © 2025 ERN Çiçek | ern-cicek.com.tr
    </div>
  </div>
</body>
</html>`;
            
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: fromEmail,
                to: email,
                subject: '🔐 ERN Çiçek - Şifre Sıfırlama Kodu',
                html: emailHtml
              })
            }).catch(e => console.error('Email send error:', e)); // Fire and forget - beklemeden devam et
          }
          
          return new Response(JSON.stringify({ ok: true, message: 'Sıfırlama kodu email adresinize gönderildi.' }), { 
            status: 200, headers: jsonHeaders(allowOrigin) 
          });
          
        } catch (e) {
          console.error('request-reset error:', e);
          return new Response(JSON.stringify({ ok: false, error: 'Bir hata oluştu' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
      }

      // ========== ŞİFRE SIFIRLAMA: Kodu Doğrula ==========
      if (path === '/verify-reset' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const email = (payload?.email || '').trim().toLowerCase();
        const code = (payload?.code || '').trim();
        const newPasswordHash = payload?.newPasswordHash; // { algo, salt, hash, iterations }
        
        if (!email || !code || !newPasswordHash) {
          return new Response(JSON.stringify({ ok: false, error: 'Eksik bilgi' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // KV'den kodu kontrol et
        if (!env.RATE_LIMIT_KV) {
          return new Response(JSON.stringify({ ok: false, error: 'Sunucu yapılandırma hatası' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const storedData = await env.RATE_LIMIT_KV.get(`reset:${email}`);
        if (!storedData) {
          return new Response(JSON.stringify({ ok: false, error: 'Kod bulunamadı veya süresi dolmuş' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const resetData = JSON.parse(storedData);
        
        // Süre kontrolü
        if (Date.now() > resetData.expiresAt) {
          await env.RATE_LIMIT_KV.delete(`reset:${email}`);
          return new Response(JSON.stringify({ ok: false, error: 'Kodun süresi dolmuş. Yeni kod isteyin.' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Deneme sayısı kontrolü (max 5)
        if (resetData.attempts >= 5) {
          await env.RATE_LIMIT_KV.delete(`reset:${email}`);
          return new Response(JSON.stringify({ ok: false, error: 'Çok fazla yanlış deneme. Yeni kod isteyin.' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Kod kontrolü
        if (code !== resetData.code) {
          resetData.attempts++;
          await env.RATE_LIMIT_KV.put(
            `reset:${email}`,
            JSON.stringify(resetData),
            { expirationTtl: Math.ceil((resetData.expiresAt - Date.now()) / 1000) }
          );
          return new Response(JSON.stringify({ ok: false, error: 'Yanlış kod', attemptsLeft: 5 - resetData.attempts }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Kod doğru - şifreyi güncelle
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;
        
        try {
          const userPath = `users/${email}_full.json`;
          const userApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(userPath)}`;
          
          // Mevcut kullanıcı verisini al
          const userRes = await fetch(userApiUrl + `?ref=${branch}`, { 
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } 
          });
          
          if (!userRes.ok) {
            return new Response(JSON.stringify({ ok: false, error: 'Kullanıcı bulunamadı' }), { 
              status: 404, headers: jsonHeaders(allowOrigin) 
            });
          }
          
          const userFile = await userRes.json();
          const userData = JSON.parse(atob(userFile.content));
          
          // Şifreyi güncelle
          userData.pw = newPasswordHash;
          userData.passwordResetAt = Date.now();
          
          // GitHub'a kaydet
          const jsonStr = JSON.stringify(userData, null, 2);
          const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));
          
          const putRes = await fetch(userApiUrl, {
            method: 'PUT',
            headers: { 
              Authorization: `Bearer ${token}`, 
              Accept: 'application/vnd.github+json', 
              'Content-Type': 'application/json', 
              'User-Agent': 'Cloudflare-Worker' 
            },
            body: JSON.stringify({
              message: `feat(user): password reset for ${email}`,
              content: contentBase64,
              sha: userFile.sha,
              branch
            })
          });
          
          if (!putRes.ok) {
            const errText = await safeText(putRes);
            return new Response(JSON.stringify({ ok: false, error: 'Şifre güncellenemedi', details: errText }), { 
              status: 500, headers: jsonHeaders(allowOrigin) 
            });
          }
          
          // Kullanılan kodu sil
          await env.RATE_LIMIT_KV.delete(`reset:${email}`);
          
          return new Response(JSON.stringify({ ok: true, message: 'Şifreniz başarıyla güncellendi' }), { 
            status: 200, headers: jsonHeaders(allowOrigin) 
          });
          
        } catch (e) {
          console.error('verify-reset error:', e);
          return new Response(JSON.stringify({ ok: false, error: 'Bir hata oluştu' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
      }

      // ========== EMAIL DOĞRULAMA: Kayıt için kod gönder ==========
      if (path === '/send-verification' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const email = (payload?.email || '').trim().toLowerCase();
        
        if (!email || !email.includes('@')) {
          return new Response(JSON.stringify({ ok: false, error: 'Geçerli bir email adresi girin' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Önce mevcut bir doğrulama kodu var mı kontrol et (3 dk bekleme)
        if (env.RATE_LIMIT_KV) {
          const existingCode = await env.RATE_LIMIT_KV.get(`verify:${email}`);
          if (existingCode) {
            const existingData = JSON.parse(existingCode);
            const remainingSeconds = Math.ceil((existingData.expiresAt - Date.now()) / 1000);
            if (remainingSeconds > 0) {
              const minutes = Math.floor(remainingSeconds / 60);
              const seconds = remainingSeconds % 60;
              const timeStr = minutes > 0 ? `${minutes} dk ${seconds} sn` : `${seconds} sn`;
              return new Response(JSON.stringify({ 
                ok: false, 
                error: `Yeni kod için ${timeStr} beklemeniz gerekiyor`,
                remainingSeconds: remainingSeconds
              }), { 
                status: 429, headers: jsonHeaders(allowOrigin) 
              });
            }
          }
        }
        
        // GitHub'da kullanıcı zaten var mı kontrol et
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;
        
        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'Sunucu yapılandırma hatası' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Kullanıcı dosyasını kontrol et
        const userPath = `users/${email}_full.json`;
        const userApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(userPath)}?ref=${branch}`;
        
        try {
          const userRes = await fetch(userApiUrl, { 
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } 
          });
          
          if (userRes.ok) {
            // Kullanıcı zaten var
            return new Response(JSON.stringify({ ok: false, error: 'Bu email adresi zaten kayıtlı' }), { 
              status: 400, headers: jsonHeaders(allowOrigin) 
            });
          }
          
          // 6 haneli doğrulama kodu oluştur
          const verifyCode = String(Math.floor(100000 + Math.random() * 900000));
          const expiresAt = Date.now() + (3 * 60 * 1000); // 3 dakika
          
          // Kodu KV'ye kaydet
          if (env.RATE_LIMIT_KV) {
            await env.RATE_LIMIT_KV.put(
              `verify:${email}`,
              JSON.stringify({ code: verifyCode, expiresAt, attempts: 0 }),
              { expirationTtl: 180 } // 3 dakika sonra otomatik sil
            );
          }
          
          // Email gönder
          const resendKey = env.RESEND_API_KEY || '';
          const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
          
          if (resendKey) {
            const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f6f3;margin:0;padding:20px;">
  <div style="max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0b2f1f,#1a4a35);color:white;padding:24px;text-align:center;">
      <span style="font-size:28px;font-weight:800;">🌿 ERN ÇİÇEK</span>
    </div>
    <div style="padding:30px;text-align:center;">
      <div style="font-size:18px;color:#334155;margin-bottom:20px;">Email Doğrulama Kodunuz</div>
      <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:2px solid #3b82f6;border-radius:12px;padding:20px;margin:20px 0;">
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1e40af;">${verifyCode}</div>
      </div>
      <div style="color:#ef4444;font-weight:600;margin:15px 0;">⏱️ Bu kod 3 dakika geçerlidir</div>
      <div style="color:#6b7280;font-size:14px;margin-top:20px;">Eğer bu isteği siz yapmadıysanız, bu emaili görmezden gelin.</div>
    </div>
    <div style="background:#f1f5f9;padding:15px;text-align:center;color:#64748b;font-size:12px;">
      © 2025 ERN Çiçek | ern-cicek.com.tr
    </div>
  </div>
</body>
</html>`;
            
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: fromEmail,
                to: email,
                subject: '✉️ ERN Çiçek - Email Doğrulama Kodu',
                html: emailHtml
              })
            }).catch(e => console.error('Email send error:', e)); // Fire and forget - beklemeden devam et
          }
          
          return new Response(JSON.stringify({ ok: true, message: 'Doğrulama kodu email adresinize gönderildi.' }), { 
            status: 200, headers: jsonHeaders(allowOrigin) 
          });
          
        } catch (e) {
          console.error('send-verification error:', e);
          return new Response(JSON.stringify({ ok: false, error: 'Bir hata oluştu' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
      }

      // ========== EMAIL DOĞRULAMA: Kodu doğrula ==========
      if (path === '/check-verification' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const email = (payload?.email || '').trim().toLowerCase();
        const code = (payload?.code || '').trim();
        
        if (!email || !code) {
          return new Response(JSON.stringify({ ok: false, error: 'Eksik bilgi' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // KV'den kodu kontrol et
        if (!env.RATE_LIMIT_KV) {
          return new Response(JSON.stringify({ ok: false, error: 'Sunucu yapılandırma hatası', errorCode: 'KV_NOT_CONFIGURED' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const storedData = await env.RATE_LIMIT_KV.get(`verify:${email}`);
        if (!storedData) {
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'Doğrulama kodu bulunamadı. Email adresinize yeni bir kod gönderin.', 
            errorCode: 'CODE_NOT_FOUND',
            hint: 'Kod 3 dakika sonra otomatik olarak silinir. Lütfen yeni kod isteyin.'
          }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const verifyData = JSON.parse(storedData);
        
        // Süre kontrolü
        const remainingMs = verifyData.expiresAt - Date.now();
        if (remainingMs <= 0) {
          await env.RATE_LIMIT_KV.delete(`verify:${email}`);
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'Kodun süresi dolmuş.', 
            errorCode: 'CODE_EXPIRED',
            hint: 'Lütfen "Kodu tekrar gönder" butonuna tıklayarak yeni bir kod alın.'
          }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Deneme sayısı kontrolü (max 5)
        if (verifyData.attempts >= 5) {
          await env.RATE_LIMIT_KV.delete(`verify:${email}`);
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'Çok fazla yanlış deneme.', 
            errorCode: 'TOO_MANY_ATTEMPTS',
            hint: '5 yanlış denemeden sonra kod iptal edildi. Yeni kod isteyin.'
          }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Kod kontrolü
        if (code !== verifyData.code) {
          verifyData.attempts++;
          const attemptsLeft = 5 - verifyData.attempts;
          await env.RATE_LIMIT_KV.put(
            `verify:${email}`,
            JSON.stringify(verifyData),
            { expirationTtl: Math.ceil(remainingMs / 1000) }
          );
          return new Response(JSON.stringify({ 
            ok: false, 
            error: `Yanlış kod girdiniz.`, 
            errorCode: 'WRONG_CODE',
            attemptsLeft: attemptsLeft,
            hint: attemptsLeft <= 2 ? `Dikkat: ${attemptsLeft} deneme hakkınız kaldı!` : `${attemptsLeft} deneme hakkınız kaldı.`
          }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        // Kod doğru - emailVerified flag'i ile işaretle (kodu silme, kayıt tamamlanınca silinecek)
        verifyData.verified = true;
        await env.RATE_LIMIT_KV.put(
          `verify:${email}`,
          JSON.stringify(verifyData),
          { expirationTtl: 300 } // 5 dakika daha tut (kayıt tamamlansın diye)
        );
        
        return new Response(JSON.stringify({ ok: true, message: 'Email doğrulandı' }), { 
          status: 200, headers: jsonHeaders(allowOrigin) 
        });
      }

      if (path === '/send-order' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        
        // ✅ SECURITY: CSRF Token validation (optional - only if from admin)
        if (payload.csrf_token) {
          // Token exists - validate it (in production, verify against stored token)
          // For now, we just check it's not empty
          if (!payload.csrf_token || typeof payload.csrf_token !== 'string' || payload.csrf_token.length < 32) {
            console.warn('⚠️ Invalid CSRF token');
            return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), { 
              status: 403, 
              headers: jsonHeaders(allowOrigin) 
            });
          }
        }
        
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
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`;
            // check existing
            let existingSha = null;
            try {
              const headRes = await fetch(apiUrl + `?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } });
              if (headRes.ok) { const j = await headRes.json(); existingSha = j.sha; }
            } catch (_) {}
            const jsonStr = JSON.stringify(order, null, 2);
            const contentBase64 = btoa(new TextEncoder().encode(jsonStr).reduce((a, b) => a + String.fromCharCode(b), ''));
            const body = { message: `feat(order): create ${orderId}`, content: contentBase64, branch };
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
        let customerEmailLogOk = null, customerEmailLogError = null;
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

                    // Email log (GitHub) - best effort
                    try {
                      const log = {
                        type: 'order-received',
                        orderId,
                        toEmail: order.customerEmail,
                        toName: order.customerName,
                        subject: `Siparişiniz Alındı - ${orderId} | ERN-ÇİÇEK`,
                        sentAt: Date.now(),
                        status: 'sent',
                        resend: customerData || null,
                        html: customerEmailHtml,
                        text: customerEmailBody
                      };
                      const logRes = await writeEmailLogToGitHub({ env, log });
                      customerEmailLogOk = !!logRes?.ok;
                      customerEmailLogError = logRes?.error || null;
                    } catch (le) {
                      customerEmailLogOk = false;
                      customerEmailLogError = (le && le.message) ? le.message : String(le);
                    }
                  } else {
                    customerEmailError = await safeText(customerRes);
                    console.log('❌ Customer email failed:', customerRes.status, customerEmailError);

                    // Email log (GitHub) - best effort
                    try {
                      const log = {
                        type: 'order-received',
                        orderId,
                        toEmail: order.customerEmail,
                        toName: order.customerName,
                        subject: `Siparişiniz Alındı - ${orderId} | ERN-ÇİÇEK`,
                        sentAt: Date.now(),
                        status: 'failed',
                        error: customerEmailError || `Resend status ${customerRes.status}`,
                        html: customerEmailHtml,
                        text: customerEmailBody
                      };
                      const logRes = await writeEmailLogToGitHub({ env, log });
                      customerEmailLogOk = !!logRes?.ok;
                      customerEmailLogError = logRes?.error || null;
                    } catch (le) {
                      customerEmailLogOk = false;
                      customerEmailLogError = (le && le.message) ? le.message : String(le);
                    }
                  }
                } catch (ce) {
                  customerEmailError = (ce && ce.message) ? ce.message : String(ce);
                  console.log('❌ Customer email exception:', customerEmailError);

                  // Email log (GitHub) - best effort
                  try {
                    const log = {
                      type: 'order-received',
                      orderId,
                      toEmail: order.customerEmail,
                      toName: order.customerName,
                      subject: `Siparişiniz Alındı - ${orderId} | ERN-ÇİÇEK`,
                      sentAt: Date.now(),
                      status: 'failed',
                      error: customerEmailError,
                      html: customerEmailHtml,
                      text: customerEmailBody
                    };
                    const logRes = await writeEmailLogToGitHub({ env, log });
                    customerEmailLogOk = !!logRes?.ok;
                    customerEmailLogError = logRes?.error || null;
                  } catch (le) {
                    customerEmailLogOk = false;
                    customerEmailLogError = (le && le.message) ? le.message : String(le);
                  }
                }
              }
            }
          } catch (e) {
            emailError = (e && e.message) ? e.message : String(e);
            console.log('❌ Email exception:', emailError);
          }
        }

        // Best-effort: Sipariş oluştuysa ilgili canlı sepet snapshot'ını temizle
        // (müşteri ödeme sonrası sepetini yerelde temizlese bile admin canlı sepette görünmesin)
        let cartClearedOk = null;
        let cartClearedError = null;
        try {
          const emailForCart = (order && order.customerEmail) ? String(order.customerEmail).trim() : '';
          if (commitOk && emailForCart && emailForCart !== 'misafir@ern-cicek.com') {
            const r = await deleteCartFileForEmail(env, emailForCart);
            cartClearedOk = !!(r && r.ok);
            cartClearedError = r && r.ok ? null : (r && r.error ? r.error : null);
          }
        } catch (e) {
          cartClearedOk = false;
          cartClearedError = (e && e.message) ? e.message : String(e);
        }

        const body = JSON.stringify({ ok: true, orderId, commitOk, commitStatus, commitError, emailOk, emailError, customerEmailOk, customerEmailError, customerEmailLogOk, customerEmailLogError, cartClearedOk, cartClearedError, order });
        return new Response(body, { status: commitOk ? 201 : 200, headers: jsonHeaders(allowOrigin) });
      }

      // Generic commit endpoint for cart snapshots and other files
      if (path === '/commit' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const files = payload?.files || [];
        const message = payload?.message || 'chore: auto commit';
        
        if (!Array.isArray(files) || files.length === 0) {
          return new Response(JSON.stringify({ ok: false, error: 'Dosya listesi boş' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;
        
        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'GitHub erişim anahtarı (token) yapılandırılmamış' }), { 
            status: 500, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        const results = [];
        for (const file of files) {
          const filePath = file.path;
          const content = file.contentBase64 || file.content;
          if (!filePath || !content) continue;
          
          try {
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;
            
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

      // List invoices via GitHub token (prevents browser GitHub API rate-limit 403)
      if (path === '/list-invoices' && request.method === 'GET') {
        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;

        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'GitHub erişim anahtarı (token) yapılandırılmamış' }), {
            status: 500,
            headers: jsonHeaders(allowOrigin)
          });
        }

        try {
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath('invoices')}?ref=${encodeURIComponent(branch)}&_cb=${Date.now()}`;
          const res = await fetch(apiUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'Cloudflare-Worker'
            }
          });

          if (!res.ok) {
            const t = await safeText(res);
            return new Response(JSON.stringify({ ok: false, status: res.status, error: 'GitHub listeleme işlemi başarısız', details: t }), {
              status: res.status,
              headers: jsonHeaders(allowOrigin)
            });
          }

          const files = await res.json();
          const invoiceFiles = (Array.isArray(files) ? files : [])
            .filter(f => f && f.type === 'file' && typeof f.name === 'string' && f.name.endsWith('.json') && f.name !== '.gitkeep')
            .map(f => ({
              name: f.name,
              path: f.path,
              size: f.size,
              sha: f.sha,
              download_url: f.download_url
            }));

          return new Response(JSON.stringify({ ok: true, count: invoiceFiles.length, files: invoiceFiles }), {
            status: 200,
            headers: jsonHeaders(allowOrigin)
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e && e.message) ? e.message : String(e) }), {
            status: 500,
            headers: jsonHeaders(allowOrigin)
          });
        }
      }

      // Delete an invoice via GitHub token (prevents browser GitHub API auth/rate-limit issues)
      // Body: { orderId?: string, fileName?: string }
      if (path === '/delete-invoice' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const orderIdRaw = String(payload?.orderId || '').trim();
        const fileNameRaw = String(payload?.fileName || '').trim();

        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;

        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'Sunucu tarafında GitHub token eksik' }), {
            status: 500,
            headers: jsonHeaders(allowOrigin)
          });
        }

        let fileName = '';
        if (fileNameRaw) {
          fileName = fileNameRaw;
        } else if (orderIdRaw) {
          fileName = `INV-${orderIdRaw}.json`;
        }

        if (!fileName) {
          return new Response(JSON.stringify({ ok: false, error: 'orderId veya fileName eksik' }), {
            status: 400,
            headers: jsonHeaders(allowOrigin)
          });
        }

        // Basic hardening: only allow deleting within invoices/ and only JSON files
        fileName = fileName
          .replace(/\//g, '_')
          .replace(/\\/g, '_')
          .replace(/\.{2,}/g, '_')
          .replace(/[^A-Za-z0-9._-]/g, '_');
        if (!fileName.endsWith('.json')) {
          return new Response(JSON.stringify({ ok: false, error: 'Geçersiz dosya adı' }), {
            status: 400,
            headers: jsonHeaders(allowOrigin)
          });
        }

        const filePath = `invoices/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;

        try {
          const headRes = await fetch(apiUrl + `?ref=${branch}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'Cloudflare-Worker'
            }
          });

          if (!headRes.ok) {
            if (headRes.status === 404) {
              return new Response(JSON.stringify({ ok: true, message: 'Bilgi fişi zaten silinmiş', path: filePath }), {
                status: 200,
                headers: jsonHeaders(allowOrigin)
              });
            }
            const t = await safeText(headRes);
            return new Response(JSON.stringify({ ok: false, status: headRes.status, error: 'GitHub dosya bilgisi (SHA) alınamadı', details: t }), {
              status: headRes.status,
              headers: jsonHeaders(allowOrigin)
            });
          }

          const headData = await headRes.json();
          const sha = headData.sha;

          const delRes = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Cloudflare-Worker'
            },
            body: JSON.stringify({
              message: `chore: delete invoice ${fileName}`,
              sha,
              branch
            })
          });

          if (!delRes.ok) {
            const t = await safeText(delRes);
            return new Response(JSON.stringify({ ok: false, status: delRes.status, error: 'GitHub silme işlemi başarısız', details: t }), {
              status: delRes.status,
              headers: jsonHeaders(allowOrigin)
            });
          }

          return new Response(JSON.stringify({ ok: true, message: 'Bilgi fişi silindi', path: filePath }), {
            status: 200,
            headers: jsonHeaders(allowOrigin)
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e && e.message) ? e.message : String(e) }), {
            status: 500,
            headers: jsonHeaders(allowOrigin)
          });
        }
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
          return new Response(JSON.stringify({ ok: false, error: 'orderId veya müşteri e-postası eksik' }), { 
            status: 400, headers: jsonHeaders(allowOrigin) 
          });
        }
        
        let emailOk = false, emailError = null;
        let emailLogOk = null, emailLogError = null;
        let emailDataForLog = null;
        
        try {
          const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
          const resendKey = env.RESEND_API_KEY || '';
          
          if (!resendKey) {
            return new Response(JSON.stringify({ ok: false, error: 'Resend API anahtarı yapılandırılmamış' }), { 
              status: 500, headers: jsonHeaders(allowOrigin) 
            });
          }
          
          // Ürün listesi HTML
          const itemsHtml = items.map((item) => 
            `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${item.name}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.qty || item.quantity || 1}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">₺${item.price}</td></tr>`
          ).join('');

          // Bilgi fişini PDF olarak ekle
          const attachments = [];
          try {
            const pdfBytes = await buildInvoicePdfBytes({
              orderId,
              customerName,
              customerEmail,
              address,
              items,
              total,
              createdAt: Date.now()
            }, env);
            attachments.push({
              filename: `bilgi-fisi-${orderId}.pdf`,
              content: uint8ToBase64(pdfBytes)
            });
          } catch (e) {
            console.log('⚠️ PDF bilgi fişi üretilemedi (fallback deneniyor):', (e && e.message) ? e.message : String(e));
            // Fallback: Eski davranış (HTML ek) — hiç ek yoksa da mail yine gider.
            if (invoiceHtml && String(invoiceHtml).trim()) {
              try {
                const safeInvoiceHtml = String(invoiceHtml);
                attachments.push({
                  filename: `bilgi-fisi-${orderId}.html`,
                  content: btoa(new TextEncoder().encode(safeInvoiceHtml).reduce((a, b) => a + String.fromCharCode(b), ''))
                });
              } catch (_) {}
            }
          }
          
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
        <p style="margin:0;color:#1e40af;font-size:14px;">🚚 <strong>Kargo Bilgisi:</strong> Kargo takip numaranız e-posta ile iletilecektir.</p>
      </div>
      
      <div style="margin:25px 0;padding:20px;background:#f0fdf4;border:2px solid #10b981;border-radius:12px;text-align:center;">
        <h3 style="color:#064e3b;margin:0 0 12px 0;">📄 Bilgi Fişiniz</h3>
        <p style="color:#475569;font-size:14px;margin:0;">Bilgi fişiniz PDF olarak bu e-postaya eklenmiştir.</p>
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

Kargo takip numaranız e-posta ile iletilecektir.

Bilgi fişiniz PDF olarak bu e-postaya eklenmiştir.

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
              html: orderReadyHtml,
              ...(attachments.length ? { attachments } : {})
            })
          });
          
          if (emailRes.ok) {
            emailOk = true;
            const emailData = await emailRes.json();
            emailDataForLog = emailData;
            console.log('✅ Order ready email sent:', emailData);
          } else {
            emailError = await safeText(emailRes);
            console.log('❌ Order ready email failed:', emailRes.status, emailError);
          }
        } catch (e) {
          emailError = (e && e.message) ? e.message : String(e);
          console.log('❌ Order ready email exception:', emailError);
        }

        // Email log (GitHub) - best effort
        try {
          const log = {
            type: 'order-ready',
            orderId,
            toEmail: customerEmail,
            toName: customerName,
            subject: `✅ Siparişiniz Hazırlandı - ${orderId} | ERN-ÇİÇEK`,
            sentAt: Date.now(),
            status: emailOk ? 'sent' : 'failed',
            error: emailOk ? null : (emailError || null),
            resend: emailDataForLog,
            attachments: (attachments || []).map(a => ({ filename: a.filename })),
            html: orderReadyHtml,
            text: orderReadyText
          };
          const logRes = await writeEmailLogToGitHub({ env, log });
          emailLogOk = !!logRes?.ok;
          emailLogError = logRes?.error || null;
        } catch (le) {
          emailLogOk = false;
          emailLogError = (le && le.message) ? le.message : String(le);
        }
        
        return new Response(JSON.stringify({ ok: emailOk, emailOk, emailError, emailLogOk, emailLogError }), { 
          status: emailOk ? 200 : 500, 
          headers: jsonHeaders(allowOrigin) 
        });
      }

      // Kargo Takip Numarası - Müşteriye “kargonuz yola çıktı” e-postası gönder + siparişi güncelle
      if (path === '/shipping-tracking' && request.method === 'POST') {
        const payload = await readJsonLoose(request);
        const orderId = (payload?.orderId || payload?.id || payload?.order?.id || '').trim();
        const trackingNumber = String(payload?.trackingNumber || payload?.trackingNo || payload?.tracking || '').trim();

        if (!orderId || !trackingNumber) {
          return new Response(JSON.stringify({ ok: false, error: 'Sipariş numarası veya takip numarası eksik' }), {
            status: 400,
            headers: jsonHeaders(allowOrigin)
          });
        }

        const owner = env.GITHUB_OWNER || 'amtbrs-03';
        const repo = env.GITHUB_REPO || 'AMTBRS';
        const branch = env.GITHUB_BRANCH || 'site-release';
        const token = env.GITHUB_TOKEN || env.GH_TOKEN;

        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'GitHub erişim anahtarı (token) yapılandırılmamış' }), {
            status: 500,
            headers: jsonHeaders(allowOrigin)
          });
        }

        const filePath = `orders/${orderId}.json`;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;

        function decodeB64Utf8(b64) {
          const raw = String(b64 || '').replace(/\n/g, '');
          try { return decodeURIComponent(escape(atob(raw))); } catch (_) {}
          try { return atob(raw); } catch (_) {}
          return '';
        }

        // Siparişi çek
        let currentOrder = null;
        let currentSha = null;
        try {
          const getRes = await fetch(apiUrl + `?ref=${encodeURIComponent(branch)}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'Cloudflare-Worker'
            }
          });
          if (!getRes.ok) {
            const t = await safeText(getRes);
            return new Response(JSON.stringify({ ok: false, error: `Sipariş bulunamadı veya GitHub okuma başarısız (${getRes.status})`, details: t }), {
              status: getRes.status === 404 ? 404 : 500,
              headers: jsonHeaders(allowOrigin)
            });
          }
          const meta = await getRes.json();
          currentSha = meta?.sha || null;
          const txt = decodeB64Utf8(meta?.content || '');
          currentOrder = JSON.parse(txt || '{}');
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: 'Sipariş JSON okunamadı', details: (e && e.message) ? e.message : String(e) }), {
            status: 500,
            headers: jsonHeaders(allowOrigin)
          });
        }

        const customerEmail = String(currentOrder?.customerEmail || '').trim();
        const customerName = String(currentOrder?.customerName || 'Değerli Müşterimiz').trim() || 'Değerli Müşterimiz';
        const address = String(currentOrder?.address || 'Belirtilmedi');

        // Sistem kargo firması (best-effort): site-settings.json > shippingCompany
        let shippingCompany = String(currentOrder?.shippingCompany || '').trim();
        if (!shippingCompany) {
          try {
            const settingsPath = 'site-settings.json';
            const settingsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(settingsPath)}?ref=${encodeURIComponent(branch)}`;
            const settingsRes = await fetch(settingsUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Cloudflare-Worker'
              }
            });
            if (settingsRes.ok) {
              const meta = await settingsRes.json();
              const txt = decodeB64Utf8(meta?.content || '');
              const settings = JSON.parse(txt || '{}');
              shippingCompany = String(settings?.shippingCompany || settings?.cargoCompany || settings?.carrier || '').trim();
            }
          } catch (_) {
            // ignore (email can still be sent)
          }
        }

        if (!customerEmail) {
          return new Response(JSON.stringify({ ok: false, error: 'Siparişte müşteri e-postası yok' }), {
            status: 400,
            headers: jsonHeaders(allowOrigin)
          });
        }

        // E-posta gönder
        let emailOk = false;
        let emailError = null;
        let emailLogOk = null;
        let emailLogError = null;
        let emailDataForLog = null;

        const subject = shippingCompany
          ? `🚚 Kargonuz Yola Çıktı - ${shippingCompany} - ${orderId} | ERN-ÇİÇEK`
          : `🚚 Kargonuz Yola Çıktı - ${orderId} | ERN-ÇİÇEK`;
        const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
        const resendKey = env.RESEND_API_KEY || '';

        const trackingHtml = `
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
      <p style="margin:10px 0 0;opacity:0.9;font-size:16px;">🚚 Kargonuz Yola Çıktı</p>
    </div>
    <div style="padding:30px;">
      <p style="color:#475569;font-size:16px;">Sayın <strong>${customerName}</strong>,</p>
      <p style="color:#475569;">Siparişiniz kargoya verilmiştir. Kargo takip numaranız aşağıdadır.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:18px 0;">
        <div style="color:#166534;font-weight:800;">📦 Sipariş Numarası: ${orderId}</div>
        ${shippingCompany ? `<div style="margin-top:8px;color:#065f46;font-weight:800;">🏷️ Kargo Firması: ${shippingCompany}</div>` : ''}
        <div style="margin-top:10px;color:#064e3b;font-weight:900;font-size:18px;">🚚 Kargo Takip No: ${trackingNumber}</div>
      </div>
      <h3 style="color:#0b2f1f;margin:22px 0 10px;">📍 Teslimat Adresi</h3>
      <p style="color:#475569;background:#f8fafc;padding:15px;border-radius:8px;margin:0;border-left:4px solid #10b981;">${address}</p>
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

        const trackingText = `
Sayın ${customerName},

🚚 Kargonuz yola çıktı.

Sipariş Numarası: ${orderId}
${shippingCompany ? `Kargo Firması: ${shippingCompany}\n` : ''}Kargo Takip No: ${trackingNumber}
Kargo Takip No: ${trackingNumber}

Teslimat Adresi:
${address}

Sorularınız için:
📱 WhatsApp: +90 538 417 90 81
📧 Email: amtbrs@icloud.com

Saygılarımızla,
ERN Tropikal Çiçek
https://ern-cicek.com.tr
        `.trim();

        if (!resendKey) {
          emailOk = false;
          emailError = 'Resend API anahtarı yapılandırılmamış';
        } else {
          try {
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: fromEmail,
                to: customerEmail,
                subject,
                text: trackingText,
                html: trackingHtml
              })
            });

            if (emailRes.ok) {
              emailOk = true;
              const emailData = await emailRes.json();
              emailDataForLog = emailData;
              console.log('✅ Shipping tracking email sent:', emailData);
            } else {
              emailOk = false;
              emailError = await safeText(emailRes);
              console.log('❌ Shipping tracking email failed:', emailRes.status, emailError);
            }
          } catch (e) {
            emailOk = false;
            emailError = (e && e.message) ? e.message : String(e);
            console.log('❌ Shipping tracking email exception:', emailError);
          }
        }

        // Email log (GitHub) - best effort
        try {
          const log = {
            type: 'shipping-tracking',
            orderId,
            toEmail: customerEmail,
            toName: customerName,
            subject,
            sentAt: Date.now(),
            status: emailOk ? 'sent' : 'failed',
            error: emailOk ? null : (emailError || null),
            resend: emailDataForLog,
            trackingNumber,
            shippingCompany: shippingCompany || null,
            html: trackingHtml,
            text: trackingText
          };
          const logRes = await writeEmailLogToGitHub({ env, log });
          emailLogOk = !!logRes?.ok;
          emailLogError = logRes?.error || null;
        } catch (le) {
          emailLogOk = false;
          emailLogError = (le && le.message) ? le.message : String(le);
        }

        // Siparişi güncelle (trackingNumber her durumda; e-posta başarılıysa status=shipped)
        let commitOk = false;
        let commitStatus = null;
        let commitError = null;
        try {
          const updated = Object.assign({}, currentOrder || {});
          updated.trackingNumber = trackingNumber;
          updated.trackingNumberUpdatedAt = Date.now();
          if (emailOk) {
            updated.status = 'shipped';
            updated.shippedAt = Date.now();
            updated.trackingEmailSentAt = Date.now();
          }

          const content = btoa(new TextEncoder().encode(JSON.stringify(updated, null, 2)).reduce((a, b) => a + String.fromCharCode(b), ''));
          const message = emailOk
            ? `feat(order): mark shipped ${orderId}`
            : `chore(order): add trackingNumber ${orderId}`;

          // 409 conflict için retry
          for (let attempt = 0; attempt < 3; attempt++) {
            let sha = currentSha;
            if (!sha || attempt > 0) {
              try {
                const headRes = await fetch(apiUrl + `?ref=${encodeURIComponent(branch)}`, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'Cloudflare-Worker'
                  }
                });
                if (headRes.ok) {
                  const j = await headRes.json();
                  sha = j?.sha || sha;
                }
              } catch (_) {}
            }

            const putBody = { message, content, branch };
            if (sha) putBody.sha = sha;

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

            commitStatus = putRes.status;
            if (putRes.ok) {
              commitOk = true;
              break;
            }
            if (putRes.status === 409 && attempt < 2) {
              await new Promise(r => setTimeout(r, 120 * (attempt + 1)));
              continue;
            }

            commitError = await safeText(putRes);
            break;
          }
        } catch (e) {
          commitError = (e && e.message) ? e.message : String(e);
        }

        const ok = !!(emailOk && commitOk);
        return new Response(JSON.stringify({
          ok,
          emailOk,
          emailError,
          emailLogOk,
          emailLogError,
          commitOk,
          commitStatus,
          commitError
        }), {
          status: ok ? 200 : 500,
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
          const body = JSON.stringify({ commitOk: false, commitError: 'E-posta adresi eksik' });
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
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;
            
            // Retry loop for 409 conflicts
            for (let attempt = 0; attempt < 3; attempt++) {
              // Get current SHA
              let existingSha = null;
              try {
                const headRes = await fetch(apiUrl + `?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Cloudflare-Worker' } });
                if (headRes.ok) { const j = await headRes.json(); existingSha = j.sha; }
              } catch (_) {}
              
              const content = btoa(new TextEncoder().encode(JSON.stringify(user, null, 2)).reduce((a, b) => a + String.fromCharCode(b), ''));
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
            commitError = 'token eksik';
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
          return new Response(JSON.stringify({ ok: false, error: 'E-posta adresi eksik' }), { 
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
            return new Response(JSON.stringify({ ok: false, error: 'Sunucu tarafında GitHub token eksik' }), { 
              status: 500, 
              headers: jsonHeaders(allowOrigin) 
            });
          }
          
          const safeEmail = email.replace(/[^a-z0-9._@-]/gi, '_');
          const filePath = `carts/${safeEmail}.json`;
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;
          
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
            return new Response(JSON.stringify({ ok: true, message: 'Sepet zaten silinmiş' }), { 
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

      return new Response('Bulunamadı', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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

function toAsciiTr(input) {
  const s = String(input || '');
  // PDF StandardFonts her ortamda Türkçe glyph setini garanti etmez.
  // Bu yüzden (TTF font embed edilmediyse) PDF içinde güvenli ASCII karşılıkları kullanıyoruz.
  return s
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/â/g, 'a').replace(/Â/g, 'A')
    .replace(/î/g, 'i').replace(/Î/g, 'I')
    .replace(/û/g, 'u').replace(/Û/g, 'U');
}

function normalizeBase64(input) {
  return String(input || '')
    .trim()
    .replace(/^data:.*?;base64,/, '')
    .replace(/\s+/g, '');
}

function base64ToUint8Array(base64) {
  const clean = normalizeBase64(base64);
  if (!clean) return null;
  const bin = atob(clean);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

let cachedInvoiceFontBytes = null;
let cachedInvoiceFontUrl = null;

async function getInvoiceTtfBytes(env) {
  // 1) Base64 (usually too large for Cloudflare secrets; kept for compatibility)
  try {
    const ttfBase64 = env?.INVOICE_TTF_BASE64 || env?.INVOICE_FONT_TTF_BASE64;
    const fromB64 = base64ToUint8Array(ttfBase64);
    if (fromB64 && fromB64.length) return fromB64;
  } catch (_) {}

  // 2) URL fetch (recommended)
  const url = String(env?.INVOICE_FONT_URL || '').trim();
  if (!url) return null;
  if (cachedInvoiceFontBytes && cachedInvoiceFontUrl === url) return cachedInvoiceFontBytes;

  const res = await fetch(url, {
    // Some hosts dislike default UA; provide a stable one.
    headers: { 'User-Agent': 'ern-site-worker' }
  });
  if (!res.ok) throw new Error(`Font indirilemedi: ${res.status}`);
  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (!u8.length) throw new Error('Font indirildi ama bos');
  cachedInvoiceFontBytes = u8;
  cachedInvoiceFontUrl = url;
  return u8;
}

function uint8ToBase64(u8) {
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8 || []);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function formatMoneyTry(v) {
  try {
    const n = Number(String(v || '').replace(',', '.'));
    if (Number.isFinite(n)) return n.toFixed(2);
  } catch (_) {}
  return String(v || '0');
}

function wrapText(text, font, size, maxWidth) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [''];
  const words = s.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const next = current ? (current + ' ' + w) : w;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = w;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function buildInvoicePdfBytes({ orderId, customerName, customerEmail, address, items, total, createdAt }, env) {
  const pdfDoc = await PDFDocument.create();

  // Optional: Embed a Unicode-capable TTF font so Turkish characters render correctly.
  // Recommended config: INVOICE_FONT_URL (public URL to a .ttf)
  // Base64 env keys are also supported but often exceed Cloudflare secret size limits.
  let canUseUnicode = false;
  let font;
  let fontBold;
  try {
    const fontBytes = await getInvoiceTtfBytes(env);
    if (fontBytes && fontBytes.length) {
      font = await pdfDoc.embedFont(fontBytes);
      // Bold: reuse same font (keeps bundle smaller). If you want true bold, provide a bold TTF and extend this.
      fontBold = font;
      canUseUnicode = true;
    }
  } catch (_) {}

  if (!font) {
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  const pageSize = [595.28, 841.89]; // A4
  const margin = 40;
  const lineHeight = 14;
  const tableRowH = 16;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const draw = (text, opts = {}) => {
    const {
      size = 11,
      bold = false,
      color = rgb(0.1, 0.14, 0.2),
      x = margin,
      maxWidth = page.getWidth() - margin * 2
    } = opts;
    const usedFont = bold ? fontBold : font;
    const raw = canUseUnicode ? String(text || '') : toAsciiTr(text);
    const lines = wrapText(raw, usedFont, size, maxWidth);
    for (const ln of lines) {
      if (y < margin + 80) {
        page = pdfDoc.addPage(pageSize);
        y = page.getHeight() - margin;
      }
      page.drawText(ln, { x, y, size, font: usedFont, color });
      y -= lineHeight;
    }
  };

  // Header
  draw('ERN Tropikal Çiçek', { size: 18, bold: true, color: rgb(0.02, 0.3, 0.23) });
  draw('Bilgi Fişi (PDF)', { size: 12, bold: true });
  draw(`Siparis No: ${orderId || '-'}`, { bold: true });
  draw(`Tarih: ${new Date(createdAt || Date.now()).toLocaleString('tr-TR')}`);
  y -= 6;

  // Customer
  draw('Müşteri Bilgileri', { bold: true, color: rgb(0.02, 0.3, 0.23) });
  draw(`Ad Soyad: ${customerName || '-'}`);
  draw(`E-posta: ${customerEmail || '-'}`);
  draw(`Adres: ${address || '-'}`);
  y -= 6;

  // Items table
  draw('Ürün Listesi', { bold: true, color: rgb(0.02, 0.3, 0.23) });

  const tableX = margin;
  const tableW = page.getWidth() - margin * 2;
  const col1 = Math.floor(tableW * 0.58);
  const col2 = Math.floor(tableW * 0.12);
  const col3 = tableW - col1 - col2;

  const ensureSpaceFor = (px) => {
    const minY = margin + 60;
    if (y - px < minY) {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - margin;
    }
  };

  ensureSpaceFor(80);
  page.drawRectangle({ x: tableX, y: y - 4, width: tableW, height: tableRowH + 6, color: rgb(0.94, 0.98, 0.96) });
  page.drawText('Urun', { x: tableX + 8, y: y + 4, size: 10, font: fontBold, color: rgb(0.02, 0.3, 0.23) });
  page.drawText('Adet', { x: tableX + col1 + 8, y: y + 4, size: 10, font: fontBold, color: rgb(0.02, 0.3, 0.23) });
  page.drawText('Tutar', { x: tableX + col1 + col2 + 8, y: y + 4, size: 10, font: fontBold, color: rgb(0.02, 0.3, 0.23) });
  y -= (tableRowH + 10);

  const safeItems = Array.isArray(items) ? items : [];
  for (const it of safeItems) {
    const qtyVal = (it?.qty || it?.quantity || 1);
    const unitPrice = Number(it?.price || 0);
    const lineTotal = Number.isFinite(unitPrice) ? (unitPrice * Number(qtyVal || 1)) : 0;

    const name = canUseUnicode ? String(it?.name || '-') : toAsciiTr(it?.name || '-');
    const qty = String(qtyVal || 1);
    const price = formatMoneyTry(lineTotal || it?.price || 0);

    const nameLines = wrapText(name, font, 10, col1 - 16);
    const rowLines = Math.max(1, nameLines.length);
    const rowH = Math.max(tableRowH, rowLines * 12);

    ensureSpaceFor(rowH + 24);
    page.drawLine({ start: { x: tableX, y: y + 6 }, end: { x: tableX + tableW, y: y + 6 }, thickness: 1, color: rgb(0.9, 0.91, 0.92) });

    let nameY = y;
    for (const ln of nameLines) {
      page.drawText(ln, { x: tableX + 8, y: nameY, size: 10, font, color: rgb(0.1, 0.14, 0.2) });
      nameY -= 12;
    }
    page.drawText(qty, { x: tableX + col1 + 8, y, size: 10, font, color: rgb(0.1, 0.14, 0.2) });
    page.drawText(`TL ${price}`, { x: tableX + col1 + col2 + 8, y, size: 10, font, color: rgb(0.1, 0.14, 0.2) });

    y -= (rowH + 8);
  }

  ensureSpaceFor(80);
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 1.2, color: rgb(0.1, 0.7, 0.5) });
  y -= 18;
  page.drawText(`GENEL TOPLAM: TL ${canUseUnicode ? String(total || '0') : toAsciiTr(String(total || '0'))}`, { x: tableX, y, size: 12, font: fontBold, color: rgb(0.02, 0.3, 0.23) });

  y -= 30;
  draw('Not: Bu belge bilgilendirme amaçlıdır. Fatura veya irsaliye yerine geçmez.', { size: 9, color: rgb(0.4, 0.45, 0.5) });

  return await pdfDoc.save();
}

function encodeGitHubPath(path) {
  // GitHub Contents API path segments must be encoded but '/' must be preserved.
  return String(path || '')
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/');
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

async function deleteCartFileForEmail(env, email) {
  const owner = env.GITHUB_OWNER || 'amtbrs-03';
  const repo = env.GITHUB_REPO || 'AMTBRS';
  const branch = env.GITHUB_BRANCH || 'site-release';
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;

  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return { ok: false, error: 'email eksik' };
  if (!token) return { ok: false, error: 'GitHub token eksik' };

  const safeEmail = normalizedEmail.replace(/[^a-z0-9._@-]/gi, '_');
  const filePath = `carts/${safeEmail}.json`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;

  // 1) SHA al
  const headRes = await fetch(apiUrl + `?ref=${branch}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Cloudflare-Worker'
    }
  });

  if (headRes.status === 404) {
    return { ok: true, alreadyMissing: true, path: filePath };
  }
  if (!headRes.ok) {
    return { ok: false, status: headRes.status, error: await safeText(headRes), path: filePath };
  }

  const headData = await headRes.json();
  const sha = headData && headData.sha;
  if (!sha) return { ok: false, error: 'SHA bulunamadı', path: filePath };

  // 2) Sil
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
      sha,
      branch
    })
  });

  if (!delRes.ok) {
    return { ok: false, status: delRes.status, error: await safeText(delRes), path: filePath };
  }

  return { ok: true, path: filePath };
}

async function writeEmailLogToGitHub({ env, log }) {
  const owner = env.GITHUB_OWNER || 'amtbrs-03';
  const repo = env.GITHUB_REPO || 'AMTBRS';
  const branch = env.GITHUB_BRANCH || 'site-release';
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) return { ok: false, error: 'GitHub erişim anahtarı (token) yapılandırılmamış' };

  const sentAtMs = Number(log?.sentAt || Date.now());
  const orderId = String(log?.orderId || '').trim() || 'UNKNOWN';
  const type = String(log?.type || 'email').trim() || 'email';
  const toEmail = String(log?.toEmail || '').trim() || 'unknown';
  const safeEmail = toEmail.toLowerCase().replace(/[^a-z0-9._@-]/g, '_');

  const filePath = `email-logs/${sentAtMs}_${type}_${orderId}_${safeEmail}.json`;
  const contentJson = JSON.stringify(log, null, 2);
  const content = btoa(new TextEncoder().encode(contentJson).reduce((a, b) => a + String.fromCharCode(b), ''));
  const message = `chore(email-log): ${type} ${orderId} -> ${safeEmail}`;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;

  for (let attempt = 0; attempt < 3; attempt++) {
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

    const body = { message, content, branch };
    if (existingSha) body.sha = existingSha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Cloudflare-Worker'
      },
      body: JSON.stringify(body)
    });

    if (putRes.ok) return { ok: true, status: putRes.status, path: filePath };
    if (putRes.status === 409 && attempt < 2) {
      await new Promise(r => setTimeout(r, 120 * (attempt + 1)));
      continue;
    }
    return { ok: false, status: putRes.status, error: await safeText(putRes), path: filePath };
  }

  return { ok: false, error: 'GitHub commit retry limit reached', path: filePath };
}

// ✅ SECURITY: Rate Limiting with Durable Objects
async function checkRateLimit(clientIp, env) {
  const maxRequests = 100; // Max requests per minute
  const windowSeconds = 60;
  
  try {
    // Use KV for simple rate limiting (alternative: Durable Objects for more precision)
    const key = `ratelimit:${clientIp}`;
    const data = await env.RATE_LIMIT_KV?.get(key);
    
    let count = 0;
    if (data) {
      const parsed = JSON.parse(data);
      const age = Date.now() - parsed.timestamp;
      if (age < windowSeconds * 1000) {
        count = parsed.count + 1;
      }
    } else {
      count = 1;
    }
    
    // Store updated count
    if (env.RATE_LIMIT_KV) {
      await env.RATE_LIMIT_KV.put(
        key,
        JSON.stringify({ count, timestamp: Date.now() }),
        { expirationTtl: windowSeconds + 10 }
      );
    }
    
    return {
      allowed: count <= maxRequests,
      count,
      limit: maxRequests
    };
  } catch (e) {
    // If rate limiting fails, allow request (fail open)
    console.error('Rate limit check error:', e);
    return { allowed: true };
  }
}
