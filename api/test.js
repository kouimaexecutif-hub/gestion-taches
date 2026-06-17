const { getJSON, readBody } = require('../lib/store');
const { envoyerRecaps } = require('../lib/recap');

// Envoi d'un test immédiat à tous les destinataires (depuis la page Configuration).
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
    const results = await envoyerRecaps(settings, tasks, { forcer: true, prefix: '🔔 (TEST)\n' });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
