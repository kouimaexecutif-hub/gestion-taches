// Couche de stockage : utilise Vercel KV / Upstash Redis si configuré,
// sinon une mémoire temporaire (utile pour tester avant de brancher la base).
const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!global.__memstore) global.__memstore = {};
const mem = global.__memstore;

function configured() { return !!(URL && TOKEN); }

async function redis(cmd) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('Erreur stockage ' + r.status);
  return (await r.json()).result;
}

async function getJSON(key, def) {
  if (!configured()) return (key in mem) ? mem[key] : def;
  const v = await redis(['GET', key]);
  return v ? JSON.parse(v) : def;
}

async function setJSON(key, val) {
  if (!configured()) { mem[key] = val; return; }
  await redis(['SET', key, JSON.stringify(val)]);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

/* Verrou court, pour les séquences « lire, modifier, réécrire ».
 *
 * Pourquoi il existe. Le registre des tâches tient dans une seule clé. Pour
 * modifier une tâche, il faut lire la liste entière, y appliquer le changement,
 * puis la réécrire. Si deux personnes enregistrent au même instant, les deux
 * lisent la même liste, et la seconde écriture efface la première — sans
 * erreur, sans message, ni pour celui qui perd son texte ni pour celui qui
 * l'écrase. La fenêtre ne dure que quelques millisecondes, mais elle s'ouvre à
 * chaque enregistrement, et l'outil est fait pour que plusieurs personnes y
 * inscrivent leur avancement.
 *
 * Ce que le verrou n'est pas : une protection contre un conflit d'intentions.
 * Deux personnes qui modifient la MÊME tâche restent un conflit ; il se règle
 * dans api/tasks.js, en comparant la date de dernière modification. Le verrou
 * ne règle que la collision technique entre deux écritures simultanées.
 *
 * En mémoire (aucune base configurée), on exécute directement : ce mode ne sert
 * qu'aux essais locaux, sur un seul processus.
 */
/* Scripts Redis exécutés d'un seul tenant (atomiques).
   ECRIRE_SI_VERROU : n'écrit la valeur que si NOTRE jeton tient encore le
   verrou. Avant, si la séquence durait plus que la durée du verrou, un second
   enregistrement passait, puis le premier réécrivait la liste lue avant lui :
   les deux recevaient « enregistré » et le second était perdu (audit du
   26/09/2026).
   LIBERER : supprime le verrou seulement s'il est encore le nôtre (le GET puis
   DEL d'avant pouvait supprimer celui d'un autre entre les deux commandes). */
const ECRIRE_SI_VERROU = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[2], ARGV[2]) else return false end";
const LIBERER = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

async function avecVerrou(nom, travail) {
  /* `ecrire` est la seule façon d'écrire pendant le verrou : sous Redis, elle
     refuse d'écrire si le verrou a été perdu. */
  if (!configured()) return await travail({ ecrire: setJSON });

  const cle = 'verrou:' + nom;
  /* Jeton propre à cet appel : il évite de libérer le verrou d'un autre si le
     nôtre a expiré entre-temps. */
  const jeton = Date.now() + '-' + Math.random().toString(36).slice(2);
  const ecrire = async (key, val) => {
    const r = await redis(['EVAL', ECRIRE_SI_VERROU, '2', cle, key, jeton, JSON.stringify(val)]);
    if (r !== 'OK') throw new Error('Enregistrement trop lent : il n\'a pas été appliqué. Réessayez.');
  };

  for (let essai = 0; essai < 25; essai++) {
    // NX : ne pose le verrou que s'il est libre. PX : il expire seul au bout de
    // 10 s, pour qu'une fonction interrompue ne bloque pas le registre à vie.
    const pris = await redis(['SET', cle, jeton, 'NX', 'PX', 10000]);
    if (pris) {
      try {
        return await travail({ ecrire });
      } finally {
        await redis(['EVAL', LIBERER, '1', cle, jeton]).catch(() => {});
      }
    }
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error('Le registre est occupé par un autre enregistrement. Réessayez dans un instant.');
}

/* Pose une clé seulement si elle n'existe pas encore (SET NX), avec une durée
   de vie. Rend true si c'est cet appel qui l'a posée. Sert à n'envoyer le récap
   qu'une fois par jour, même si Vercel déclenche la tâche deux fois. */
async function poserSiAbsent(key, val, secondes) {
  if (!configured()) { if (key in mem) return false; mem[key] = val; return true; }
  return (await redis(['SET', key, JSON.stringify(val), 'NX', 'EX', secondes])) === 'OK';
}
async function supprimer(key) {
  if (!configured()) { delete mem[key]; return; }
  await redis(['DEL', key]);
}

module.exports = { getJSON, setJSON, configured, readBody, avecVerrou, poserSiAbsent, supprimer };
