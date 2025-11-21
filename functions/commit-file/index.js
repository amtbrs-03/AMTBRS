// Serverless function to commit files to GitHub repository
// Expects JSON body: { files: [{ path: 'products.json', contentBase64: '...' }, ...], message: 'commit message' }
// Requires env: GITHUB_TOKEN (personal access token with repo permissions)
const OWNER = process.env.GITHUB_OWNER || 'amtbrs-03';
const REPO = process.env.GITHUB_REPO || 'AMTBRS';
const BRANCH = process.env.GITHUB_BRANCH || 'site-release';

async function ghGet(path){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'netlify-function' } });
  return res;
}

async function ghPut(path, contentBase64, message, sha){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;
  const body = { message: message || `Update ${path}`, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'netlify-function', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res;
}

exports.handler = async function(event, context){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok:false, msg:'Method not allowed' }) };
  if (!process.env.GITHUB_TOKEN) return { statusCode: 500, body: JSON.stringify({ ok:false, msg:'GITHUB_TOKEN not configured' }) };

  let payload;
  try { payload = JSON.parse(event.body); } catch(e){ return { statusCode:400, body: JSON.stringify({ ok:false, msg:'invalid json' }) }; }
  const files = Array.isArray(payload.files) ? payload.files : [];
  const message = payload.message || 'admin: update from admin panel';

  const results = [];
  for (const f of files){
    if (!f.path || !f.contentBase64) { results.push({ path: f.path||null, ok:false, msg:'missing fields' }); continue; }
    try{
      // check if exists to get sha
      const getRes = await ghGet(f.path);
      let sha = null;
      if (getRes.ok){
        const json = await getRes.json();
        sha = json.sha;
      }
      const putRes = await ghPut(f.path, f.contentBase64, message, sha);
      if (!putRes.ok){
        const text = await putRes.text();
        results.push({ path: f.path, ok:false, status: putRes.status, msg: text });
        continue;
      }
      const j = await putRes.json();
      results.push({ path: f.path, ok:true, commit: j.commit && j.commit.sha });
    }catch(err){ results.push({ path: f.path, ok:false, msg: err.message || String(err) }); }
  }

  return { statusCode: 200, body: JSON.stringify({ ok:true, results }) };
};
