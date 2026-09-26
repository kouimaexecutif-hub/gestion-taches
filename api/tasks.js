const { getJSON, readBody, avecVerrou } = require('../lib/store');
const { refuse } = require('../lib/garde');
const { construireRecap } = require('../lib/recap');

/* Version du protocole de la page. Une page plus ancienne est priée de se
   recharger : elle ne connaît pas les champs ajoutés depuis, et ses envois
   les effaçaient (constat du 26/09/2026 sur « Résultat » et « Date de
   réalisation »). À augmenter à chaque changement des champs d'une tâche. */
const PROTOCOLE = 2;

/* Champs d'une tâche, tous en texte, sauf l'avancement (entier de 0 à 100).
   Tout autre champ envoyé est ignoré : une valeur de balisage ou un objet dans
   « état » ou « priorité » s'affichait tel quel dans la page. */
const CHAMPS_TEXTE = ['tache', 'description', 'comment', 'ressources', 'responsable', 'priorite', 'etat',
  'debut', 'echeance', 'dateRealisation', 'resultat', 'notes'];
function champsConnus(src) {
  const o = {};
  if (!src || typeof src !== 'object') return o;
  for (const k of CHAMPS_TEXTE) if (k in src) o[k] = String(src[k] == null ? '' : src[k]).slice(0, 5000);
  if ('responsable' in o) o.responsable = o.responsable.trim();
  // Une date est AAAA-MM-JJ ou vide : tout autre texte s'affichait tel quel.
  for (const k of ['debut', 'echeance', 'dateRealisation']) if (k in o && !/^\d{4}-\d{2}-\d{2}$/.test(o[k])) o[k] = '';
  if ('progres' in src) o.progres = Math.max(0, Math.min(100, Math.round(Number(src.progres) || 0)));
  return o;
}

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
      /* Aperçu du récap : le texte réellement envoyé, construit par la même
         fonction que l'envoi (la page en écrivait une seconde version). */
      if (req.query && req.query.apercu !== undefined) {
        const settings = await getJSON('settings', {});
        const nom = String(req.query.apercu || '');
        return res.status(200).json({ texte: construireRecap(tasks, settings, { responsable: nom || null, nomDest: nom }) });
      }
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

      if ((Number(body.protocole) || 0) < PROTOCOLE) {
        return res.status(409).json({
          rechargerPage: true,
          error: 'Cette page est une version ancienne de l\'application. '
            + 'Rechargez-la avant d\'enregistrer : elle effacerait des champs ajoutés depuis.'
        });
      }

      const action = body.action;
      if (action !== 'enregistrer' && action !== 'supprimer') {
        return res.status(400).json({ error: 'Action inconnue : ' + String(action) });
      }

      const resultat = await avecVerrou('tasks', async ({ ecrire }) => {
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

        /* Modifier une tâche que quelqu'un vient de supprimer : on ne la recrée
           pas sans le dire (elle revenait, avec une nouvelle date de création).
           La page propose de la recréer ; elle renvoie alors `recreer`. */
        if (!existante && action === 'enregistrer' && base > 0 && !body.recreer) {
          return { code: 409, corps: { supprimee: true, tasks } };
        }

        const maintenant = new Date().toISOString();
        if (action === 'supprimer') {
          tasks.splice(i, 1);
        } else {
          /* Fusion avec la tâche existante : un champ que la page n'envoie pas
             est GARDÉ. Avant, la tâche entière était remplacée, et un champ
             inconnu de la page disparaissait. */
          const tache = Object.assign({}, existante || {}, champsConnus(body.tache), {
            id: id,
            cree: existante ? (existante.cree || maintenant) : maintenant,
            maj: maintenant,                                   // pour l'affichage
            rev: (Number(existante && existante.rev) || 0) + 1  // pour la détection de conflit
          });
          if (existante) tasks[i] = tache; else tasks.push(tache);
        }

        await ecrire('tasks', tasks);
        return { code: 200, corps: { ok: true, tasks } };
      });

      return res.status(resultat.code).json(resultat.corps);
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
