const { getJSON, readBody } = require('../lib/store');
const { envoyerRecaps } = require('../lib/recap');
const { refuse } = require('../lib/garde');

// Envoi d'un test immédiat à tous les destinataires (depuis la page Configuration).
// Même vérification du code que les autres routes (code de la base OU code de secours).
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const body = await readBody(req);
    if (await refuse(req, res, body)) return;
    const settings = await getJSON('settings', {});
    const tasks = await getJSON('tasks', []);
    const results = await envoyerRecaps(settings, tasks, { forcer: true, prefix: '🔔 (TEST)\n' });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
