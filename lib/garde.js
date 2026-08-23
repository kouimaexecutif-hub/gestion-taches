/* Garde d'accès commune aux routes de données.
 *
 * Pourquoi elle existe. Jusqu'au 24/08/2026, `/api/tasks` répondait à tout le
 * monde, en lecture ET en écriture : n'importe qui pouvait lire le registre des
 * tâches du cabinet — dont les titres nomment les clients — le réécrire, ou y
 * déposer du balisage qui s'exécutait ensuite dans le navigateur du cabinet.
 * `/api/settings` renvoyait de son côté les numéros de téléphone des
 * collaborateurs. Les deux sont désormais derrière le code administrateur, le
 * même que celui de la page Configuration.
 *
 * Ce que la garde N'EST PAS. Ce n'est pas un système de comptes : il y a un
 * seul code, partagé. Il protège d'un inconnu qui trouve l'adresse, pas d'un
 * collaborateur qui partagerait le code. C'est le niveau qui correspond à
 * l'outil — un registre interne à une petite équipe.
 *
 * Le cas « aucun code défini ». La garde laisse alors passer. C'est délibéré et
 * c'est la convention déjà suivie par settings.js : sans cela, une installation
 * neuve serait murée avant même qu'on ait pu définir un code. La conséquence à
 * connaître : tant qu'aucun code n'est défini, l'API est ouverte. La page
 * Configuration le dit, et le premier code saisi ferme la porte.
 */
const { getJSON } = require('./store');

async function refuse(req, res) {
  const settings = await getJSON('settings', {});
  if (!settings.adminCode) return false;               // pas encore configuré
  const fourni = req.headers['x-admin-code']
    || (req.query && req.query.code)
    || '';
  if (fourni === settings.adminCode) return false;
  res.status(401).json({ error: 'Code administrateur requis.', codeRequis: true });
  return true;
}

module.exports = { refuse };
