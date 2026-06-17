const { getJSON, setJSON, readBody } = require('../lib/store');

// Champs secrets jamais renvoyés au navigateur
const SECRETS = ['twilioToken', 'adminCode'];

function masquer(s) {
  const pub = { ...s };
  for (const k of SECRETS) { pub[k + 'Set'] = !!s[k]; delete pub[k]; }
  return pub;
}

module.exports = async (req, res) => {
  try {
    const s = await getJSON('settings', {});

    if (req.method === 'GET') {
      return res.status(200).json({ settings: masquer(s), storageReady: require('../lib/store').configured() });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);

      // Protection : si un code admin existe déjà, il faut le fournir
      if (s.adminCode) {
        const fourni = req.headers['x-admin-code'] || body.adminCodeActuel;
        if (fourni !== s.adminCode) {
          return res.status(401).json({ error: 'Code administrateur incorrect' });
        }
      }

      const champs = ['nomEntreprise', 'heureRecap', 'whatsappDest', 'twilioSid', 'twilioFrom'];
      const next = { ...s };
      for (const c of champs) if (c in body) next[c] = (body[c] || '').toString().trim();

      // Secrets : on ne remplace que si une nouvelle valeur non vide est fournie
      if (body.twilioToken) next.twilioToken = body.twilioToken.toString().trim();
      if (body.nouveauCode) next.adminCode = body.nouveauCode.toString().trim();
      else if (!s.adminCode && body.adminCode) next.adminCode = body.adminCode.toString().trim();

      await setJSON('settings', next);
      return res.status(200).json({ ok: true, settings: masquer(next) });
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
