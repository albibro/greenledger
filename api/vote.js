const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const _rl = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const e = _rl.get(ip);
  if (!e || now > e.r) { _rl.set(ip, { c: 1, r: now + 60000 }); return true; }
  if (e.c >= 10) return false;
  e.c++; return true;
}

async function supabase(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });

  // GET /api/vote?token=XXX — carica dati per lo stakeholder
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token mancante' });

    const stk = await fetch(
      `${SUPABASE_URL}/rest/v1/stakeholders?token=eq.${token}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    ).then(r => r.json());

    if (!stk || !stk[0]) return res.status(404).json({ error: 'token non valido' });

    const assessment = await fetch(
      `${SUPABASE_URL}/rest/v1/assessments?session_key=eq.${stk[0].session_key}&select=data`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    ).then(r => r.json());

    return res.json({
      stakeholder: stk[0],
      topics: assessment[0]?.data?.topics || [],
      company: assessment[0]?.data?.m1?.ragione || 'Azienda',
    });
  }

  // POST /api/vote — salva voti stakeholder
  if (req.method === 'POST') {
    const { token, scores } = req.body;
    if (!token) return res.status(400).json({ error: 'token mancante' });

    const result = await supabase(
      `stakeholders?token=eq.${token}`,
      'PATCH',
      { scores, status: 'done', completed_at: new Date().toISOString() }
    );
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
