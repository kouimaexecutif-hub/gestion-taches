const { getJSON, setJSON, readBody, avecVerrou } = require('../lib/store');
const { refuse } = require('../lib/garde');

/* Registre des tâches.
 *
 * Ce que cette route faisait jusqu'au 01/09/2026, et pourquoi c'était grave.
 * Enregistrer une tâche envoyait la LISTE ENTIÈRE, qui remplaçait celle du
 * serveur. Deux personnes qui travaillaient en même temps ne se voyaient pas :
 * la seconde à enregistrer réécrivait le registre à partir de la liste qu'elle
 * avait chargée avant les modifications de la première, et le travail de la
 * première disparaissait. Sans erreur, sans message. Celui qui perdait son
 * texte ne l'apprenait qu'en le cherchant, plus tard.
 *
 * Ce que la route fait maintenant. Elle ne reçoit plus qu'UNE tâche à la fois,
 * et c'est le serveur qui l'insère dans la liste. Deux personnes qui modifient
 * des tâches différentes ne se gênent donc plus jamais. Deux personnes qui
 * modifient la MÊME tâche sont détectées — chaque tâche porte la date de sa
 * dernière modification — et la seconde est refusée avec la version du serveur,
 * plutôt que d'écraser en silence.
 *
 * Le registre reste stocké comme un simple tableau de tâches : le récapitulatif
 * WhatsApp (lib/recap.js) et la tâche planifiée (api/cron.js) le lisent tel
 * quel, et n'ont pas eu à changer.
 */
module.exports = async (req, res) => {
  try {
    // Lecture ET ecriture derriere le code administrateur : les titres des
    // taches nomment les clients du cabinet, et l'ecriture ouverte permettait
    // a un inconnu de reecrire le registre ou d'y deposer du balisage.
    if (await refuse(req, res)) return;

    if (req.method === 'GET') {
      const tasks = await getJSON('tasks', []);
      return res.status(200).json({ tasks });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);

      /* Une page restée ouverte depuis avant cette correction envoie encore la
         liste entière. On la refuse : l'appliquer, c'est exactement le geste
         qui effaçait le travail des autres. Le message dit quoi faire. */
      if (Array.isArray(body.tasks)) {
        return res.status(409).json({
          rechargerPage: true,
          error: 'Cette page est une version ancienne de l\'application. '
            + 'Rechargez-la avant d\'enregistrer, sinon vous risqueriez d\'effacer '
            + 'le travail de vos collègues.'
        });
      }

      const action = body.action;
      if (action !== 'enregistrer' && action !== 'supprimer') {
        return res.status(400).json({ error: 'Action inconnue : ' + String(action) });
      }

      const resultat = await avecVerrou('tasks', async () => {
        const tasks = await getJSON('tasks', []);
        const id = String((action === 'enregistrer' ? (body.tache || {}).id : body.id) || '');
        if (!id) return { code: 400, corps: { error: 'Tâche sans identifiant.' } };

        const i = tasks.findIndex(t => t && t.id === id);
        const existante = i >= 0 ? tasks[i] : null;

        /* Conflit d'intentions : la tâche a changé sur le serveur depuis que
           cette page l'a chargée. On ne tranche pas à la place des gens — on
           refuse et on rend la version du serveur.

           Le repère est un compteur (« rev »), pas une date. Une date au
           millième de seconde paraît suffisante, mais deux enregistrements
           rapprochés peuvent tomber dans la même milliseconde : la tâche est
           alors modifiée sans que sa date change, et le conflit passe inaperçu
           — l'essai automatisé l'a reproduit du premier coup. Un compteur ne
           peut pas se répéter.

           Les tâches créées avant cette correction n'ont pas de compteur : il
           vaut 0 des deux côtés, elles passent donc sans être bloquées. */
        const base = Number(body.base) || 0;
        if (existante && (Number(existante.rev) || 0) !== base) {
          return { code: 409, corps: { conflit: true, tache: existante, tasks } };
        }

        // Supprimer une tâche déjà supprimée n'est pas une erreur.
        if (!existante && action === 'supprimer') {
          return { code: 200, corps: { ok: true, tasks } };
        }

        const maintenant = new Date().toISOString();
        if (action === 'supprimer') {
          tasks.splice(i, 1);
        } else {
          const tache = Object.assign({}, body.tache, {
            id: id,
            cree: existante ? (existante.cree || maintenant) : maintenant,
            maj: maintenant,                                   // pour l'affichage
            rev: (Number(existante && existante.rev) || 0) + 1  // pour la détection de conflit
          });
          if (existante) tasks[i] = tache; else tasks.push(tache);
        }

        await setJSON('tasks', tasks);
        return { code: 200, corps: { ok: true, tasks } };
      });

      return res.status(resultat.code).json(resultat.corps);
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
