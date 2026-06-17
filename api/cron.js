const { getJSON, setJSON } = require('../lib/store');
const { construireRecap, envoyerWhatsApp } = require('../lib/recap');

// Déclenché automatiquement par Vercel Cron chaque matin.
module.exports = async (req, res) => {
  try {
    const estCron = (req.headers['user-agent'] || '').includes('vercel-cron') || req.headers['x-vercel-cron'];
    const settings = await getJSON('settings', {});
    const code = req.headers['x-admin-code'] || (req.query && req.query.code);
    // Autorisé si appelé par Vercel Cron, ou manuellement avec le code admin
    if (!estCron && (!settings.adminCode || code !== settings.adminCode)) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const tasks = await getJSON('tasks', []);
    const texte = construireRecap(tasks, settings);
    const r = await envoyerWhatsApp(settings, texte);

    await setJSON('dernierEnvoi', { quand: new Date().toISOString(), status: r.status, sid: r.sid });
    return res.status(200).json({ ok: true, envoye: true, status: r.status });
  } catch (e) {
    await setJSON('dernierEnvoi', { quand: new Date().toISOString(), erreur: String(e && e.message || e) }).catch(() => {});
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
