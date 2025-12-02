export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname || '/send-order';

    // Utilities
    function json(data, status=200){ return new Response(JSON.stringify(data), { status, headers:{'content-type':'application/json'} }); }
    function toBase64Utf8(str) {
      const enc = new TextEncoder();
      const bytes = enc.encode(str);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    async function ghPutFile({ owner, repo, path, content, message, branch, token }){
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ERN-CICEK-Worker/2025',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ message, content: toBase64Utf8(content), branch })
      });
      return res;
    }
    async function ghGetFile({ owner, repo, path, ref, token }){
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref||'')}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ERN-CICEK-Worker/2025',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      return res;
    }

    // Common env
    const OWNER = env.OWNER || env.GH_OWNER || env.GITHUB_OWNER || '';
    const REPO = env.REPO || env.GH_REPO || env.GITHUB_REPO || '';
    const BRANCH = env.BRANCH || env.GH_BRANCH || env.GITHUB_BRANCH || 'site-release';
    const TOKEN = env.GITHUB_TOKEN;

    if (request.method !== 'POST') {
      return json({ ok:false, error:'Method Not Allowed' }, 405);
    }
    let input;
    try {
      input = await request.json();
    } catch (e) {
      return json({ ok:false, error:'Invalid JSON' }, 400);
    }

    // Extract fields with safe defaults
    const now = Date.now();
    const orderId = `ORD-${now}`;
    const customerEmail = input.customerEmail || input.payerEmail || 'misafir@ern-cicek.com';
    const customerName = input.customerName || 'Misafir';
    const address = input.address || '';
    const total = input.total || '';
    const iban = input.iban || '';
    const cart = Array.isArray(input.cart) ? input.cart : [];

    const order = {
      id: orderId,
      date: now,
      customerEmail,
      customerName,
      address,
      total,
      iban,
      status: 'pending',
      items: cart
    };

    // Build commit payload
    const owner = env.OWNER || env.GH_OWNER || env.GITHUB_OWNER || '';
    const repo = env.REPO || env.GH_REPO || env.GITHUB_REPO || '';
    const branch = env.BRANCH || env.GH_BRANCH || env.GITHUB_BRANCH || 'site-release';
    const path = `orders/${orderId}.json`;

    if (pathname.endsWith('/update-user')) {
      // Update user profile (address etc.) and commit under users/<email>_full.json
      const email = String(input.email || input.customerEmail || '').trim();
      if (!email) return json({ ok:false, error:'email required' }, 400);
      const address = input.address || input.addresses || input.addressUpdate || null;
      const name = input.name || input.customerName || null;

      let existing = null;
      const userPath = `users/${email}_full.json`;
      try {
        const getRes = await ghGetFile({ owner:OWNER, repo:REPO, path:userPath, ref:BRANCH, token:TOKEN });
        if (getRes.ok) {
          const getJson = await getRes.json();
          const decoded = JSON.parse(atob(getJson.content));
          existing = decoded;
        }
      } catch(_) {}

      const merged = existing || {};
      if (name) merged.name = name;
      if (email) merged.email = email;
      if (address) {
        // Normalize into both address and addresses[0]
        merged.address = address;
        if (!Array.isArray(merged.addresses)) merged.addresses = [];
        const def = (Array.isArray(merged.addresses) && merged.addresses.find(a=>a&&a.isDefault)) || null;
        const newDefault = Object.assign({ id:'default', title:'Varsayılan Adres', isDefault:true }, address);
        if (def) {
          Object.assign(def, newDefault);
        } else {
          merged.addresses.unshift(newDefault);
        }
      }
      // housekeeping
      merged.updatedAt = Date.now();

      const message = `chore(user): update profile for ${email}`;
      const contentStr = JSON.stringify(merged, null, 2);

      let commitOk=false, commitStatus=null, commitError=null;
      try{
        const putRes = await ghPutFile({ owner:OWNER, repo:REPO, path:userPath, content:contentStr, message, branch:BRANCH, token:TOKEN });
        commitStatus = putRes.status; commitOk = putRes.ok;
        if (!putRes.ok) commitError = (await putRes.text()).slice(0,2000);
      }catch(e){ commitError = e?.message || String(e); }

      return json({ ok:true, email, commitOk, commitStatus, commitError, user: merged }, commitOk?201:200);
    }

    const ghBody = {
      message: `feat: add order ${orderId}`,
      content: toBase64Utf8(JSON.stringify(order, null, 2)),
      branch: BRANCH
    };

    let commitOk = false, commitStatus = null, commitError = null;
    try {
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ERN-CICEK-Worker/2025',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(ghBody)
      });
      commitStatus = res.status;
      commitOk = res.ok;
      if (!res.ok) {
        const errTxt = await res.text();
        commitError = errTxt.slice(0, 2000);
      }
    } catch (e) {
      commitError = e?.message || String(e);
    }

    return new Response(JSON.stringify({ ok:true, orderId, commitOk, commitStatus, commitError, order }), {
      status: commitOk ? 201 : 200,
      headers: { 'content-type': 'application/json' }
    });
  }
};
