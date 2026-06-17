const { getJSON, setJSON } = require('../lib/store');
const { envoyerRecaps } = require('../lib/recap');

// Déclenché automatiquement par Vercel Cron chaque matin.
module.exports = async (req, res) => {
  try {
    const estCron = (req.headers['user-agent'] || '').includes('vercel-cron') || req.headers['x-vercel-cron'];
    const settings = await getJSON('settings', {});
    const code = req.headers['x-admin-code'] || (req.query && req.query.code);
    if (!estCron && (!settings.adminCode || code !== settings.adminCode)) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const tasks = await getJSON('tasks', []);
    const results = await envoyerRecaps(settings, tasks);
    await setJSON('dernierEnvoi', { quand: new Date().toISOString(), results });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    await setJSON('dernierEnvoi', { quand: new Date().toISOString(), erreur: String(e && e.message || e) }).catch(() => {});
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
