/**
 * Cloudflare Worker - Sepet Hatırlatma Scheduled Job
 * 
 * Her saat çalışır ve 3 saatten fazla bekleyen sepetler için
 * kullanıcılara hatırlatma e-postası gönderir.
 * 
 * Gerekli ENV değişkenleri:
 * - GITHUB_TOKEN: GitHub API erişimi için
 * - GH_OWNER: Repository sahibi (amtbrs-03)
 * - GH_REPO: Repository adı (AMTBRS)
 * - GH_BRANCH: Branch adı (site-release)
 * - RESEND_API_KEY: Resend.com API anahtarı
 * - FROM_EMAIL: Gönderen e-posta adresi
 * 
 * wrangler.toml'a eklenecek:
 * [triggers]
 * crons = ["0 * * * *"]  # Her saat başı
 */

export default {
  // Scheduled event handler
  async scheduled(event, env, ctx) {
    console.log('Sepet hatırlatma kontrolü başladı:', new Date().toISOString());
    
    const OWNER = env.GH_OWNER || env.GITHUB_OWNER || 'amtbrs-03';
    const REPO = env.GH_REPO || env.GITHUB_REPO || 'AMTBRS';
    const BRANCH = env.GH_BRANCH || env.GITHUB_BRANCH || 'site-release';
    const TOKEN = env.GITHUB_TOKEN;
    const RESEND_API_KEY = env.RESEND_API_KEY;
    const FROM_EMAIL = env.FROM_EMAIL || 'Ern Çiçek <siparis@ern-cicek.com.tr>';
    
    // 3 saat = 10800000 ms
    const REMINDER_THRESHOLD_MS = 3 * 60 * 60 * 1000;
    // Hatırlatma gönderildikten sonra tekrar göndermemek için 24 saat bekle
    const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    
    if (!TOKEN || !RESEND_API_KEY) {
      console.error('GITHUB_TOKEN veya RESEND_API_KEY eksik');
      return;
    }
    
    try {
      // carts/ klasöründeki tüm dosyaları listele
      const cartsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/carts?ref=${BRANCH}`, {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ERN-CICEK-CartReminder/2025'
        }
      });
      
      if (!cartsRes.ok) {
        console.error('Sepet dosyaları alınamadı:', cartsRes.status);
        return;
      }
      
      const files = await cartsRes.json();
      const now = Date.now();
      let remindersSent = 0;
      
      for (const file of files) {
        if (!file.name.endsWith('.json') || file.name === '.gitkeep') continue;
        
        try {
          // Sepet dosyasını oku
          const cartRes = await fetch(file.download_url);
          if (!cartRes.ok) continue;
          
          const cart = await cartRes.json();
          
          // Boş sepeti atla
          if (!cart.items || cart.items.length === 0) continue;
          if (!cart.email) continue;
          
          // 3 saatten fazla beklemiş mi?
          const firstAddedAt = cart.firstAddedAt || cart.updatedAt || now;
          const waitingMs = now - firstAddedAt;
          
          if (waitingMs < REMINDER_THRESHOLD_MS) continue;
          
          // Son hatırlatma kontrolü (24 saat içinde gönderilmişse atla)
          const lastReminder = cart.lastReminderSentAt || 0;
          if ((now - lastReminder) < REMINDER_COOLDOWN_MS) continue;
          
          // E-posta gönder
          const emailSent = await sendReminderEmail(cart, env, FROM_EMAIL, RESEND_API_KEY);
          
          if (emailSent) {
            // Hatırlatma gönderildi olarak işaretle
            cart.lastReminderSentAt = now;
            cart.reminderCount = (cart.reminderCount || 0) + 1;
            
            // Güncellenmiş sepeti kaydet
            await updateCartFile(cart, file.path, OWNER, REPO, BRANCH, TOKEN);
            remindersSent++;
            console.log(`Hatırlatma gönderildi: ${cart.email}`);
          }
        } catch (e) {
          console.error(`Sepet işlenirken hata (${file.name}):`, e.message);
        }
      }
      
      console.log(`Sepet hatırlatma tamamlandı. ${remindersSent} hatırlatma gönderildi.`);
      
    } catch (e) {
      console.error('Sepet hatırlatma hatası:', e.message);
    }
  },
  
  // HTTP request handler (test için)
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === '/test-reminder') {
      // Test için manuel tetikleme
      await this.scheduled({}, env, {});
      return new Response(JSON.stringify({ ok: true, message: 'Sepet hatırlatma kontrolü çalıştırıldı' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ ok: true, service: 'cart-reminder' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Hatırlatma e-postası gönder
async function sendReminderEmail(cart, env, fromEmail, apiKey) {
  const { email, name, items, totalPrice, totalQty } = cart;
  
  // Ürün listesi HTML
  const itemsHtml = items.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 0; color: #374151;">${item.name}</td>
      <td style="padding: 12px 0; text-align: center; color: #6b7280;">${item.qty} adet</td>
      <td style="padding: 12px 0; text-align: right; color: #16a34a; font-weight: 600;">₺${(item.price * item.qty).toFixed(2)}</td>
    </tr>
  `).join('');
  
  const customerName = name || email.split('@')[0];
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">🌿 Ern Çiçek</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Doğanın Güzelliği Evinizde</p>
    </div>
    
    <!-- Content -->
    <div style="background: #fff; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      
      <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px;">Merhaba ${customerName} 👋</h2>
      
      <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Sepetinizde sizi bekleyen güzel bitkiler var! Bu özel ürünleri seçtiniz ama alışverişinizi henüz tamamlamadınız.
      </p>
      
      <p style="color: #4b5563; line-height: 1.6; margin: 0 0 25px 0;">
        Stok durumu değişebilir, bu yüzden favori bitkilerinizi kaçırmamak için alışverişinizi tamamlamanızı öneririz. 🌱
      </p>
      
      <!-- Ürün Tablosu -->
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">📦 Sepetinizdeki Ürünler</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 8px 0; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase;">Ürün</th>
              <th style="padding: 8px 0; text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase;">Adet</th>
              <th style="padding: 8px 0; text-align: right; color: #6b7280; font-size: 12px; text-transform: uppercase;">Fiyat</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 15px 0 0 0; text-align: right; color: #374151; font-weight: 600;">Toplam (${totalQty} ürün):</td>
              <td style="padding: 15px 0 0 0; text-align: right; color: #16a34a; font-weight: 700; font-size: 18px;">₺${totalPrice.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 25px;">
        <a href="https://ern-cicek.com.tr" style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #fff; text-decoration: none; padding: 15px 40px; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(22,163,74,0.3);">
          🛒 Alışverişi Tamamla
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
        Sorularınız mı var? Bize her zaman <a href="mailto:info@ern-cicek.com.tr" style="color: #16a34a;">info@ern-cicek.com.tr</a> adresinden ulaşabilirsiniz.
      </p>
      
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
      <p style="margin: 0 0 5px 0;">© 2025 Ern Çiçek - Tüm hakları saklıdır.</p>
      <p style="margin: 0;">Bu e-posta sepetinizde bekleyen ürünler olduğu için gönderilmiştir.</p>
    </div>
    
  </div>
</body>
</html>
  `;
  
  const textContent = `
Merhaba ${customerName},

Sepetinizde sizi bekleyen güzel bitkiler var!

Sepetinizdeki Ürünler:
${items.map(item => `- ${item.name} (${item.qty} adet): ₺${(item.price * item.qty).toFixed(2)}`).join('\n')}

Toplam: ₺${totalPrice.toFixed(2)}

Alışverişinizi tamamlamak için: https://ern-cicek.com.tr

Ern Çiçek
  `;
  
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: '🌿 Sepetinizde sizi bekleyen bitkiler var!',
        html: htmlContent,
        text: textContent
      })
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.error(`E-posta gönderilemedi (${email}):`, errText);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error(`E-posta gönderme hatası (${email}):`, e.message);
    return false;
  }
}

// Sepet dosyasını güncelle
async function updateCartFile(cart, path, owner, repo, branch, token) {
  // Önce mevcut SHA'yı al
  let sha = null;
  try {
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ERN-CICEK-CartReminder/2025'
      }
    });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (e) {}
  
  // Dosyayı güncelle
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(cart, null, 2))));
  const body = {
    message: `chore: cart reminder sent to ${cart.email}`,
    content,
    branch
  };
  if (sha) body.sha = sha;
  
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ERN-CICEK-CartReminder/2025'
    },
    body: JSON.stringify(body)
  });
  
  return res.ok;
}
