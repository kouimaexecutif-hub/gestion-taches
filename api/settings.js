const { getJSON, readBody, avecVerrou } = require('../lib/store');
const { refuse } = require('../lib/garde');

// Champs secrets jamais renvoyés au navigateur
const SECRETS = ['twilioToken', 'adminCode', 'callmebotApikey'];

function masquer(s) {
  const pub = { ...s };
  for (const k of SECRETS) { pub[k + 'Set'] = !!s[k]; delete pub[k]; }
  pub.collaborateurs = (s.collaborateurs || []).map(c => ({
    id: c.id || '', nom: c.nom || '', numero: c.numero || '', tout: !!c.tout, cleSet: !!c.cle
  }));
  return pub;
}

module.exports = async (req, res) => {
  try {
    const s = await getJSON('settings', {});

    if (req.method === 'GET') {
      /* La lecture renvoyait les numeros de telephone des collaborateurs sans
         aucune authentification. Les secrets etaient deja masques (masquer()
         ne rend que des booleens adminCodeSet / twilioTokenSet / …) ; les
         numeros, eux, sortaient en clair. Meme code que l'ecriture.
         Une exception : quand AUCUN code n'est encore defini, on repond, sans
         quoi la page Configuration ne pourrait pas afficher l'etat initial et
         on ne pourrait jamais definir le premier code. */
      if (await refuse(req, res)) return;
      /* Dernier envoi du récap (date, échecs par personne) : écrit par la tâche
         planifiée, il n'était relu nulle part. */
      const dernierEnvoi = await getJSON('dernierEnvoi', null);
      return res.status(200).json({ settings: masquer(s), storageReady: require('../lib/store').configured(), dernierEnvoi });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);

      /* Même vérification que partout (code de la base OU code de secours). */
      if (await refuse(req, res, body)) return;

      /* Lecture, modification et écriture sous verrou : deux enregistrements
         simultanés de la configuration ne s'écrasent plus. */
      const resultat = await avecVerrou('settings', async ({ ecrire }) => {
      const s = await getJSON('settings', {});
      const champs = ['nomEntreprise', 'heureRecap', 'whatsappDest', 'methode', 'callmebotPhone', 'twilioSid', 'twilioFrom'];
      const next = { ...s };
      for (const c of champs) if (c in body) next[c] = (body[c] || '').toString().trim();

      if (body.twilioToken) next.twilioToken = body.twilioToken.toString().trim();
      if (body.callmebotApikey) next.callmebotApikey = body.callmebotApikey.toString().trim();
      if (body.nouveauCode) next.adminCode = body.nouveauCode.toString().trim();
      else if (!s.adminCode && body.adminCode) next.adminCode = body.adminCode.toString().trim();

      // Collaborateurs : fusion en conservant la clé existante si aucune nouvelle n'est fournie
      if (Array.isArray(body.collaborateurs)) {
        const existing = s.collaborateurs || [];
        const nouveaux = body.collaborateurs.filter(c => c && (c.nom || c.numero));
        /* Une liste vide qui remplacerait une liste existante est refusée,
           sauf confirmation : une page chargée à moitié envoyait une liste vide
           et effaçait tous les destinataires et leurs clés. */
        if (!nouveaux.length && existing.length && !body.confirmerAucunDestinataire) {
          return { code: 409, corps: { error: 'La liste des destinataires serait vidée. Rechargez la page Configuration : elle ne s\'est sans doute pas chargée entièrement.' } };
        }
        /* Un collaborateur est retrouvé par son identifiant stable, puis par son
           numéro, puis par son nom : corriger l'orthographe d'un nom ne fait
           plus perdre sa clé CallMeBot. */
        const nouvelId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        next.collaborateurs = nouveaux.map(c => {
          const numero = String(c.numero || '').trim(), nom = String(c.nom || '').trim();
          const prev = existing.find(e => c.id && e.id === c.id)
            || existing.find(e => numero && (e.numero || '').replace(/\s/g, '') === numero.replace(/\s/g, ''))
            || existing.find(e => e.nom === nom);
          const cle = (c.cle && String(c.cle).trim()) ? String(c.cle).trim() : (prev ? prev.cle : '');
          return { id: (prev && prev.id) || c.id || nouvelId(), nom, numero, tout: !!c.tout, cle };
        });
      }

      await ecrire('settings', next);
      return { code: 200, corps: { ok: true, settings: masquer(next) } };
      });
      return res.status(resultat.code).json(resultat.corps);
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
