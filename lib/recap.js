// Récap par personne + envoi WhatsApp (CallMeBot gratuit ou Twilio), multi-destinataires

function frDate(d) {
  if (!d) return '—';
  const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

/* Date du jour à Libreville (le serveur Vercel tourne en UTC). */
function jourLibreville() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Libreville', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/* Un nom de responsable se compare sans casse ni espaces de bord : « Jean » et
   « jean » désignent la même personne, qui ne recevait pas sa tâche. */
const memeNom = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
function tachesDe(allTasks, responsable) {
  return (responsable == null) ? allTasks : allTasks.filter(t => memeNom(t.responsable, responsable));
}

// responsable = null -> toutes les tâches ; sinon -> uniquement celles de cette personne
function construireRecap(allTasks, settings, opts = {}) {
  const nom = (settings && settings.nomEntreprise) ? settings.nomEntreprise : 'Tâches journalières';
  const today = jourLibreville();
  const responsable = (opts.responsable === undefined) ? null : opts.responsable;
  const scope = tachesDe(allTasks, responsable);
  const actives = scope.filter(t => t.etat !== 'Terminé');
  const base = actives.length ? actives : scope;

  let txt = `*${nom} — Récap du ${frDate(today)}*\n`;
  if (opts.nomDest) txt += `👤 ${opts.nomDest}\n`;
  txt += '\n';
  if (!base.length) { txt += (responsable == null) ? 'Aucune tâche en cours.' : 'Aucune tâche en cours qui vous est assignée. 👍'; return txt; }

  const ordre = { 'Haute': 0, 'Moyenne': 1, 'Basse': 2 };
  const tri = [...base].sort((a, b) => (ordre[a.priorite] ?? 1) - (ordre[b.priorite] ?? 1));
  tri.forEach(t => {
    const flag = t.priorite === 'Haute' ? ' ⚠️' : '';
    let ligne = `• ${t.tache} — ${t.etat} (${t.progres || 0}%)${flag}`;
    if (t.echeance) ligne += `\n   échéance : ${frDate(t.echeance)}`;
    txt += ligne + '\n';
  });
  const moy = Math.round(base.reduce((s, t) => s + (+t.progres || 0), 0) / base.length);
  const termine = scope.filter(t => t.etat === 'Terminé').length;
  txt += `\nAvancement moyen : ${moy}%`;
  txt += `\nTerminées : ${termine}/${scope.length}`;
  return txt;
}

async function envoyerCallMeBot(numero, cle, texte) {
  const phone = (numero || '').replace(/\s/g, '');
  if (!phone || !cle) throw new Error('CallMeBot : numéro ou clé API manquant.');
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(texte)}&apikey=${encodeURIComponent(cle)}`;
  const r = await fetch(url);
  const body = (await r.text().catch(() => '')) || '';
  if (!r.ok) throw new Error('CallMeBot (' + r.status + ') : ' + body.replace(/<[^>]*>/g, ' ').trim().slice(0, 160));
  if (/apikey|not\s*valid|invalid|error|wrong/i.test(body) && !/queued|sent|success|processed/i.test(body)) {
    throw new Error('CallMeBot : ' + body.replace(/<[^>]*>/g, ' ').trim().slice(0, 160));
  }
  return { status: 'envoyé' };
}

async function envoyerTwilio(settings, numero, texte) {
  const sid = settings.twilioSid, token = settings.twilioToken;
  let from = settings.twilioFrom, to = numero;
  if (!sid || !token || !from || !to) throw new Error('Twilio : configuration incomplète.');
  const norm = v => v.startsWith('whatsapp:') ? v : 'whatsapp:' + v.replace(/\s/g, '');
  from = norm(from); to = norm(to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: to, Body: texte });
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Twilio: ' + (data.message || ('erreur ' + r.status)));
  /* « queued » veut dire accepté, pas remis : un WhatsApp libre à quelqu'un
     qui n'a pas écrit au numéro depuis 24 h échoue ensuite (erreur 63016).
     Le statut est rapporté tel quel pour ne pas le compter comme remis. */
  return { status: data.status ? ('Twilio : ' + data.status + ' (accepté, remise non confirmée)') : 'envoyé' };
}

/* Twilio refuse un message de plus de 1 600 caractères (erreur 21617), ce qui
   arrivait vers 17 tâches. Le récap est découpé ligne par ligne en morceaux de
   1 500 caractères au plus, numérotés. */
const TAILLE_MAX = 1500;
function decouper(texte) {
  if (texte.length <= TAILLE_MAX) return [texte];
  const morceaux = []; let cur = '';
  for (const ligne of texte.split('\n')) {
    const l = ligne.length > TAILLE_MAX ? ligne.slice(0, TAILLE_MAX - 1) + '…' : ligne;
    if (cur && (cur.length + 1 + l.length) > TAILLE_MAX - 12) { morceaux.push(cur); cur = l; }
    else cur = cur ? cur + '\n' + l : l;
  }
  if (cur) morceaux.push(cur);
  return morceaux.map((m, i) => `(${i + 1}/${morceaux.length}) ` + m);
}

async function envoyerA(settings, recipient, texte) {
  const methode = settings.methode || (recipient.cle ? 'callmebot' : (settings.twilioSid ? 'twilio' : 'callmebot'));
  let dernier = null;
  for (const morceau of decouper(texte)) {
    dernier = methode === 'twilio'
      ? await envoyerTwilio(settings, recipient.numero, morceau)
      : await envoyerCallMeBot(recipient.numero, recipient.cle, morceau);
  }
  return dernier;
}

function destinataires(settings) {
  const cols = Array.isArray(settings.collaborateurs) ? settings.collaborateurs.filter(c => c && c.numero) : [];
  if (cols.length) return cols.map(c => ({ nom: c.nom || '', numero: c.numero, cle: c.cle || '', tout: !!c.tout }));
  if (settings.whatsappDest) return [{ nom: '', numero: settings.whatsappDest, cle: settings.callmebotApikey || '', tout: true }];
  return [];
}

async function envoyerRecaps(settings, tasks, opts = {}) {
  const dest = destinataires(settings);
  if (!dest.length) throw new Error('Aucun destinataire configuré.');
  const results = [];
  for (const d of dest) {
    const responsable = d.tout ? null : d.nom;
    const scope = tachesDe(tasks, responsable);
    const actives = scope.filter(t => t.etat !== 'Terminé');
    if (!opts.forcer && !d.tout && actives.length === 0) { results.push({ nom: d.nom, ignore: true }); continue; }
    const texte = (opts.prefix || '') + construireRecap(tasks, settings, { responsable, nomDest: d.nom });
    try { const r = await envoyerA(settings, d, texte); results.push({ nom: d.nom, ok: true, status: r.status }); }
    catch (e) { results.push({ nom: d.nom, ok: false, error: String(e && e.message || e) }); }
  }
  return results;
}

module.exports = { construireRecap, envoyerRecaps, envoyerA, destinataires, frDate, jourLibreville, decouper, memeNom };
