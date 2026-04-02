/**
 * api/send-email.js
 *
 * Supabase "Send Email" Auth Hook → chiama Resend API.
 *
 * Configurazione Supabase:
 *   Dashboard → Authentication → Hooks → Send Email Hook
 *   URL: https://greenledger-six.vercel.app/api/send-email
 *   Secret: valore di HOOK_SECRET (env var su Vercel)
 *
 * Env vars richieste su Vercel:
 *   RESEND_API_KEY   — chiave Resend (re_...)
 *   HOOK_SECRET      — stringa casuale per verificare le chiamate Supabase
 *   PUBLIC_URL       — https://greenledger-six.vercel.app
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const HOOK_SECRET    = process.env.HOOK_SECRET;
const PUBLIC_URL     = process.env.PUBLIC_URL || 'https://greenledger-six.vercel.app';
const FROM_EMAIL     = 'GreenLedger <noreply@greenledger.app>'; // cambia con il tuo dominio verificato su Resend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Verifica secret ──
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (HOOK_SECRET && token !== HOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Payload da Supabase ──
  const { user, email_data } = req.body || {};
  if (!user?.email || !email_data) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { email } = user;
  const name = user.user_metadata?.full_name || '';
  const {
    token_hash,
    redirect_to,
    email_action_type,
  } = email_data;

  // ── Costruisci URL di verifica Supabase ──
  const supabaseUrl = process.env.SUPABASE_URL || 'https://sxcuhojxbqyrvouabmeo.supabase.co';
  const redirectTo  = redirect_to || `${PUBLIC_URL}/dashboard.html`;

  const typeMap = {
    signup:       'signup',
    recovery:     'recovery',
    magiclink:    'magiclink',
    magic_link:   'magiclink',
    invite:       'invite',
    email_change: 'email_change',
  };
  const verifyType = typeMap[email_action_type] || email_action_type;
  const verifyUrl  = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${verifyType}&redirect_to=${encodeURIComponent(redirectTo)}`;

  // ── Scegli template ──
  let subject, html;
  switch (email_action_type) {
    case 'signup':
      subject = 'Conferma il tuo account GreenLedger';
      html     = templateConfirm(email, name, verifyUrl);
      break;
    case 'recovery':
      subject = 'Reimposta la tua password — GreenLedger';
      html     = templateReset(email, name, verifyUrl);
      break;
    case 'magiclink':
    case 'magic_link':
      subject = 'Il tuo link di accesso a GreenLedger';
      html     = templateMagicLink(email, name, verifyUrl);
      break;
    case 'invite':
      subject = 'Sei stato invitato su GreenLedger';
      html     = templateInvite(email, name, verifyUrl);
      break;
    default:
      subject = 'Azione richiesta su GreenLedger';
      html     = templateGeneric(email, name, verifyUrl, email_action_type);
  }

  // ── Invia con Resend ──
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Email send failed', detail: err });
  }

  return res.status(200).json({ success: true });
}

// ─────────────────────────────────────────────
//  HTML EMAIL TEMPLATES
// ─────────────────────────────────────────────

function baseLayout(content) {
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

      <!-- LOGO -->
      <tr><td style="padding-bottom:28px;text-align:center">
        <table cellpadding="0" cellspacing="0" style="display:inline-table">
          <tr>
            <td style="background:#1A7A4A;width:36px;height:36px;border-radius:10px;text-align:center;vertical-align:middle">
              <span style="color:white;font-size:18px;font-weight:bold;line-height:36px">G</span>
            </td>
            <td style="padding-left:10px;font-size:18px;font-weight:700;color:#0D3D25;letter-spacing:-.02em;vertical-align:middle">
              Green<span style="color:#1A7A4A">Ledger</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CARD -->
      <tr><td style="background:#ffffff;border:1px solid #EDE9DF;border-radius:16px;overflow:hidden">
        ${content}
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding-top:24px;text-align:center;font-size:12px;color:#6B7F72;line-height:1.6">
        GreenLedger · Double Materiality Assessment Platform<br>
        Hai ricevuto questa email perché è stata effettuata una richiesta sul tuo account.<br>
        Se non sei stato tu, ignora questa email.
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function ctaButton(url, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px auto">
    <tr><td style="background:#1A7A4A;border-radius:10px;text-align:center">
      <a href="${url}" target="_blank"
         style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-.01em">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function fallbackLink(url) {
  return `<p style="font-size:12px;color:#6B7F72;text-align:center;margin:0 32px 28px;line-height:1.6">
    Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
    <a href="${url}" style="color:#1A7A4A;word-break:break-all">${url}</a>
  </p>`;
}

function templateConfirm(email, name, url) {
  const greeting = name ? `Ciao ${name.split(' ')[0]},` : 'Ciao,';
  return baseLayout(`
    <div style="background:linear-gradient(135deg,#EEF8F3 0%,#ffffff 100%);padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1E8F56">Conferma Account</p>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em;line-height:1.2">Benvenuto su GreenLedger</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0 0 8px">${greeting}</p>
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0">
        Il tuo account è stato creato con successo. Clicca sul pulsante qui sotto per confermare la tua email e iniziare la tua prima Double Materiality Assessment.
      </p>
      ${ctaButton(url, 'Conferma il mio account')}
      <p style="font-size:13px;color:#6B7F72;margin:0 0 24px;text-align:center">
        Il link scade tra <strong>24 ore</strong>.
      </p>
    </div>
    ${fallbackLink(url)}
  `);
}

function templateReset(email, name, url) {
  const greeting = name ? `Ciao ${name.split(' ')[0]},` : 'Ciao,';
  return baseLayout(`
    <div style="background:linear-gradient(135deg,#FFFBEB 0%,#ffffff 100%);padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#D97706">Reset Password</p>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em;line-height:1.2">Reimposta la tua password</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0 0 8px">${greeting}</p>
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0">
        Abbiamo ricevuto una richiesta di reset della password per <strong>${email}</strong>.
        Clicca sul pulsante qui sotto per scegliere una nuova password.
      </p>
      ${ctaButton(url, 'Reimposta password')}
      <p style="font-size:13px;color:#6B7F72;margin:0 0 24px;text-align:center">
        Il link scade tra <strong>1 ora</strong>. Se non hai richiesto il reset, ignora questa email.
      </p>
    </div>
    ${fallbackLink(url)}
  `);
}

function templateMagicLink(email, name, url) {
  const greeting = name ? `Ciao ${name.split(' ')[0]},` : 'Ciao,';
  return baseLayout(`
    <div style="background:linear-gradient(135deg,#EEF8F3 0%,#ffffff 100%);padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1E8F56">Accesso Sicuro</p>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em;line-height:1.2">Il tuo Magic Link</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0 0 8px">${greeting}</p>
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0">
        Hai richiesto un link di accesso senza password per <strong>${email}</strong>.
        Clicca sul pulsante qui sotto per accedere direttamente a GreenLedger.
      </p>
      ${ctaButton(url, 'Accedi a GreenLedger →')}
      <p style="font-size:13px;color:#6B7F72;margin:0 0 24px;text-align:center">
        Il link scade tra <strong>1 ora</strong> ed è monouso.
      </p>
    </div>
    ${fallbackLink(url)}
  `);
}

function templateInvite(email, name, url) {
  return baseLayout(`
    <div style="background:linear-gradient(135deg,#EEF8F3 0%,#ffffff 100%);padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1E8F56">Invito</p>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em;line-height:1.2">Sei invitato su GreenLedger</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0 0 16px">
        Sei stato invitato a collaborare su GreenLedger, la piattaforma per la Double Materiality Assessment conforme CSRD.
        Clicca qui sotto per creare il tuo account e iniziare.
      </p>
      ${ctaButton(url, 'Accetta l\'invito')}
    </div>
    ${fallbackLink(url)}
  `);
}

function templateGeneric(email, name, url, type) {
  return baseLayout(`
    <div style="padding:32px 40px 24px;border-bottom:1px solid #EDE9DF">
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#0D3D25;letter-spacing:-.03em">Azione richiesta</h1>
    </div>
    <div style="padding:32px 40px 8px">
      <p style="font-size:15px;color:#3A4D40;line-height:1.7;margin:0 0 16px">
        Clicca sul link qui sotto per completare l'azione sul tuo account GreenLedger.
      </p>
      ${ctaButton(url, 'Continua')}
    </div>
    ${fallbackLink(url)}
  `);
}
