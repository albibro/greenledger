/**
 * api/send-email.js
 *
 * Endpoint chiamato da login.html dopo signUp / reset password.
 * Body: { email, type: 'confirm' | 'reset' }
 *
 * Env vars richieste su Vercel:
 *   RESEND_API_KEY          — chiave Resend (re_...)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key del progetto Supabase
 *   SUPABASE_URL            — https://xxxx.supabase.co  (opzionale, default dal codice)
 *   PUBLIC_URL              — https://greenledger-six.vercel.app (opzionale)
 */

const SB_URL     = process.env.SUPABASE_URL     || 'https://sxcuhojxbqyrvouabmeo.supabase.co';
const PUBLIC_URL = process.env.PUBLIC_URL        || 'https://greenledger-six.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY     = process.env.RESEND_API_KEY;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!RESEND_KEY)     return res.status(500).json({ error: 'RESEND_API_KEY non configurata' });
  if (!SB_SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configurata' });

  const { email, type } = req.body || {};
  if (!email || !type) return res.status(400).json({ error: 'Parametri mancanti: email, type' });
  if (!['confirm', 'reset'].includes(type)) return res.status(400).json({ error: 'type deve essere confirm o reset' });

  // ── 1. Genera action link via Supabase Admin API ──
  const sbType     = type === 'confirm' ? 'signup'   : 'recovery';
  const redirectTo = type === 'confirm' ? `${PUBLIC_URL}/dashboard.html` : `${PUBLIC_URL}/login.html`;

  let actionLink;
  try {
    const linkRes = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SB_SERVICE_KEY}`,
        'apikey':        SB_SERVICE_KEY,
      },
      body: JSON.stringify({ type: sbType, email, redirect_to: redirectTo }),
    });

    if (!linkRes.ok) {
      const err = await linkRes.json().catch(() => ({}));
      console.error('Supabase generate_link error:', err);
      return res.status(500).json({ error: err.message || 'Generazione link fallita' });
    }

    const linkData = await linkRes.json();
    actionLink = linkData.action_link;
    if (!actionLink) throw new Error('action_link assente nella risposta Supabase');
  } catch (e) {
    console.error('generate_link exception:', e);
    return res.status(500).json({ error: e.message });
  }

  // ── 2. Costruisci e invia email via Resend ──
  const subject = type === 'confirm'
    ? 'Conferma il tuo account GreenLedger'
    : 'Reimposta la tua password — GreenLedger';

  const html = type === 'confirm'
    ? templateConfirm(email, actionLink)
    : templateReset(email, actionLink);

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from:    'GreenLedger <noreply@resend.dev>',
      to:      [email],
      subject,
      html,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json().catch(() => ({}));
    console.error('Resend error:', err);
    return res.status(500).json({ error: err.message || 'Invio email fallito' });
  }

  return res.status(200).json({ ok: true });
}

// ─────────────────────────────────────────────
//  EMAIL TEMPLATES
// ─────────────────────────────────────────────

function layout(content) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GreenLedger</title>
</head>
<body style="margin:0;padding:0;background:#F7F4EE;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EE;padding:40px 20px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

      <!-- Logo -->
      <tr><td style="padding-bottom:28px;text-align:center">
        <table cellpadding="0" cellspacing="0" style="display:inline-table">
          <tr>
            <td style="background:#1A7A4A;width:36px;height:36px;border-radius:10px;text-align:center;vertical-align:middle">
              <span style="color:#fff;font-size:18px;font-weight:700;line-height:36px">G</span>
            </td>
            <td style="padding-left:10px;font-size:18px;font-weight:700;color:#0D3D25;letter-spacing:-.02em;vertical-align:middle">
              Green<span style="color:#1A7A4A">Ledger</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Card -->
      <tr><td style="background:#fff;border:1px solid #EDE9DF;border-radius:16px;overflow:hidden">
        ${content}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding-top:24px;text-align:center;font-size:12px;color:#6B7F72;line-height:1.7">
        GreenLedger · Double Materiality Assessment Platform<br>
        Hai ricevuto questa email perché è stata effettuata una richiesta sul tuo account.<br>
        Se non sei stato tu, puoi ignorare questa email in modo sicuro.
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function cta(url, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px auto">
    <tr><td style="background:#1A7A4A;border-radius:10px;text-align:center">
      <a href="${url}" target="_blank"
         style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-.01em">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function fallback(url) {
  return `<p style="font-size:12px;color:#6B7F72;text-align:center;margin:0 32px 28px;line-height:1.6">
    Se il pulsante non funziona, copia e incolla questo URL nel browser:<br>
    <a href="${url}" style="color:#1A7A4A;word-break:break-all">${url}</a>
  </p>`;
}

function templateConfirm(email, url) {
  return layout(`
    <div style="background:linear-gradient(135deg,#EEF8F3 0%,#fff 100%);padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1E8F56">Conferma Account</p>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em;line-height:1.2">Benvenuto su GreenLedger</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.75;margin:0 0 4px">Ciao,</p>
      <p style="font-size:15px;color:#3A4D40;line-height:1.75;margin:0">
        Il tuo account è stato creato con successo.<br>
        Clicca sul pulsante qui sotto per confermare la tua email e iniziare la tua prima Double Materiality Assessment.
      </p>
      ${cta(url, 'Conferma il mio account →')}
      <p style="font-size:13px;color:#6B7F72;margin:0 0 24px;text-align:center">Il link è valido per <strong>24 ore</strong>.</p>
    </div>
    ${fallback(url)}
  `);
}

function templateReset(email, url) {
  return layout(`
    <div style="background:linear-gradient(135deg,#FFFBEB 0%,#fff 100%);padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#D97706">Reset Password</p>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em;line-height:1.2">Reimposta la tua password</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.75;margin:0 0 4px">Ciao,</p>
      <p style="font-size:15px;color:#3A4D40;line-height:1.75;margin:0">
        Abbiamo ricevuto una richiesta di reset della password per <strong>${email}</strong>.<br>
        Clicca sul pulsante qui sotto per sceglierne una nuova.
      </p>
      ${cta(url, 'Reimposta password →')}
      <p style="font-size:13px;color:#6B7F72;margin:0 0 24px;text-align:center">
        Il link è valido per <strong>1 ora</strong>. Se non hai richiesto il reset, ignora questa email.
      </p>
    </div>
    ${fallback(url)}
  `);
}
