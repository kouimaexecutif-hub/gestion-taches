const { getJSON, setJSON, poserSiAbsent, supprimer } = require('../lib/store');
const { envoyerRecaps, jourLibreville } = require('../lib/recap');
const { verifierCode } = require('../lib/garde');

/* Déclenché automatiquement par Vercel Cron chaque matin.
 *
 * Qui peut déclencher l'envoi (corrigé le 26/09/2026). La route se fiait au
 * User-Agent « vercel-cron » : n'importe qui pouvait l'imiter et envoyer le
 * récap à toute l'équipe, autant de fois qu'il voulait. Désormais :
 *   - Vercel, quand la variable CRON_SECRET est définie sur le projet : il
 *     l'envoie lui-même dans l'en-tête « Authorization: Bearer … » ;
 *   - un administrateur, avec le code (appel manuel).
 * Tant que CRON_SECRET n'est pas défini, l'ancien repère est encore accepté
 * pour ne pas interrompre les récaps, et la réponse le signale.
 *
 * Une seule fois par jour. Vercel peut déclencher deux fois la même exécution :
 * une clé « recap:AAAA-MM-JJ » posée seulement si elle est absente empêche le
 * second envoi. Un appel manuel avec ?forcer=1 passe outre.
 */
module.exports = async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    const parVercel = secret
      ? req.headers.authorization === 'Bearer ' + secret
      : ((req.headers['user-agent'] || '').includes('vercel-cron') || !!req.headers['x-vercel-cron']);
    const parAdmin = !parVercel && (await verifierCode(req)) === 'ok';
    if (!parVercel && !parAdmin) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const jour = jourLibreville();
    const forcer = parAdmin && req.query && req.query.forcer === '1';
    const cleJour = 'recap:' + jour;
    if (!forcer && !(await poserSiAbsent(cleJour, { quand: new Date().toISOString() }, 172800))) {
      return res.status(200).json({ ok: true, dejaEnvoye: jour });
    }

    let results;
    try {
      const settings = await getJSON('settings', {});
      const tasks = await getJSON('tasks', []);
      results = await envoyerRecaps(settings, tasks);
    } catch (e) {
      // Rien n'est parti : la clé du jour est retirée, un nouvel essai reste possible.
      if (!forcer) await supprimer(cleJour).catch(() => {});
      throw e;
    }
    const echecs = results.filter(r => r.ok === false).length;
    const partis = results.filter(r => r.ok === true).length;
    // Aucun message parti (CallMeBot en panne, clé Twilio fausse) : la clé du
    // jour est retirée aussi, un nouvel appel avec le code relance l'envoi.
    if (!forcer && echecs > 0 && partis === 0) await supprimer(cleJour).catch(() => {});
    await setJSON('dernierEnvoi', { quand: new Date().toISOString(), jour, results, echecs, secretCron: !!secret });
    return res.status(200).json({ ok: echecs === 0, results, avertissement: secret ? undefined : 'CRON_SECRET non défini sur le projet Vercel.' });
  } catch (e) {
    await setJSON('dernierEnvoi', { quand: new Date().toISOString(), erreur: String(e && e.message || e) }).catch(() => {});
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
