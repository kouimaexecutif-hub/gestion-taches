const { getJSON, setJSON, readBody } = require('../lib/store');

// Champs secrets jamais renvoyés au navigateur
const SECRETS = ['twilioToken', 'adminCode', 'callmebotApikey'];

function masquer(s) {
  const pub = { ...s };
  for (const k of SECRETS) { pub[k + 'Set'] = !!s[k]; delete pub[k]; }
  pub.collaborateurs = (s.collaborateurs || []).map(c => ({
    nom: c.nom || '', numero: c.numero || '', tout: !!c.tout, cleSet: !!c.cle
  }));
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

      if (s.adminCode) {
        const fourni = req.headers['x-admin-code'] || body.adminCodeActuel;
        if (fourni !== s.adminCode) {
          return res.status(401).json({ error: 'Code administrateur incorrect' });
        }
      }

      const champs = ['nomEntreprise', 'heureRecap', 'whatsappDest', 'methode', 'callmebotPhone', 'twilioSid', 'twilioFrom'];
      const next = { ...s };
      for (const c of champs) if (c in body) next[c] = (body[c] || '').toString().trim();

      if (body.twilioToken) next.twilioToken = body.twilioToken.toString().trim();
      if (body.callmebotApikey) next.callmebotApikey = body.callmebotApikey.toString().trim();
      if (body.nouveauCode) next.adminCode = body.nouveauCode.toString().trim();
      else if (!s.adminCode && body.adminCode) next.adminCode = body.adminCode.toString().trim();

      // Collaborateurs : fusion en conservant la clé existante si aucune nouvelle n'est fournie
      if (Array.isArray(body.collaborateurs)) {
        const existing = s.collaborateurs || [];
        next.collaborateurs = body.collaborateurs
          .filter(c => c && (c.nom || c.numero))
          .map(c => {
            const prev = existing.find(e => e.nom === c.nom);
            const cle = (c.cle && String(c.cle).trim()) ? String(c.cle).trim() : (prev ? prev.cle : '');
            return { nom: String(c.nom || '').trim(), numero: String(c.numero || '').trim(), tout: !!c.tout, cle };
          });
      }

      await setJSON('settings', next);
      return res.status(200).json({ ok: true, settings: masquer(next) });
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
