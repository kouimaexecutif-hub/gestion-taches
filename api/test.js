const { getJSON, readBody } = require('../lib/store');
const { construireRecap, envoyerWhatsApp } = require('../lib/recap');

// Envoi d'un message de test immédiat (depuis la page Configuration).
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const settings = await getJSON('settings', {});
    const body = await readBody(req);
    const code = req.headers['x-admin-code'] || body.adminCode;
    if (settings.adminCode && code !== settings.adminCode) {
      return res.status(401).json({ error: 'Code administrateur incorrect' });
    }
    const tasks = await getJSON('tasks', []);
    const texte = '🔔 (TEST) ' + construireRecap(tasks, settings);
    const r = await envoyerWhatsApp(settings, texte);
    return res.status(200).json({ ok: true, status: r.status, apercu: texte });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
