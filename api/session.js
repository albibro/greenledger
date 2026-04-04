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
      'Prefer': method === 'POST' ? 'return=representation' : '',
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

  // POST /api/session — salva DMA e crea sessione
  if (req.method === 'POST') {
    const { session_key, company_name, data, stakeholders } = req.body;

    // Salva o aggiorna assessment
    await supabase(
      'assessments?on_conflict=session_key',
      'POST',
      { session_key, company_name, data }
    );

    // Inserisci stakeholders con token univoco
    if (stakeholders && stakeholders.length > 0) {
      const rows = stakeholders.map(s => ({
        session_key,
        name: s.name,
        org: s.org,
        category: s.cat,
        token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        status: 'invited',
      }));
      await supabase('stakeholders', 'POST', rows);
    }

    // Rileggi stakeholders con token
    const saved = await supabase(
      `stakeholders?session_key=eq.${session_key}&select=*`,
      'GET'
    );
    return res.json({ ok: true, stakeholders: saved });
  }

  // GET /api/session?key=XXX — leggi stato sessione
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key mancante' });

    const assessment = await supabase(
      `assessments?session_key=eq.${key}&select=*`,
      'GET'
    );
    const stakeholders = await supabase(
      `stakeholders?session_key=eq.${key}&select=*`,
      'GET'
    );
    return res.json({ assessment: assessment[0], stakeholders });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
