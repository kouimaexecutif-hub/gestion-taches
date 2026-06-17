// Récap par personne + envoi WhatsApp (CallMeBot gratuit ou Twilio), multi-destinataires

function frDate(d) {
  if (!d) return '—';
  const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

// responsable = null -> toutes les tâches ; sinon -> uniquement celles de cette personne
function construireRecap(allTasks, settings, opts = {}) {
  const nom = (settings && settings.nomEntreprise) ? settings.nomEntreprise : 'Tâches journalières';
  const today = new Date().toISOString().slice(0, 10);
  const responsable = (opts.responsable === undefined) ? null : opts.responsable;
  const scope = (responsable == null) ? allTasks : allTasks.filter(t => (t.responsable || '') === responsable);
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
  return { status: data.status || 'envoyé' };
}

async function envoyerA(settings, recipient, texte) {
  const methode = settings.methode || (recipient.cle ? 'callmebot' : (settings.twilioSid ? 'twilio' : 'callmebot'));
  if (methode === 'twilio') return envoyerTwilio(settings, recipient.numero, texte);
  return envoyerCallMeBot(recipient.numero, recipient.cle, texte);
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
    const scope = (responsable == null) ? tasks : tasks.filter(t => (t.responsable || '') === responsable);
    const actives = scope.filter(t => t.etat !== 'Terminé');
    if (!opts.forcer && !d.tout && actives.length === 0) { results.push({ nom: d.nom, ignore: true }); continue; }
    const texte = (opts.prefix || '') + construireRecap(tasks, settings, { responsable, nomDest: d.nom });
    try { const r = await envoyerA(settings, d, texte); results.push({ nom: d.nom, ok: true, status: r.status }); }
    catch (e) { results.push({ nom: d.nom, ok: false, error: String(e && e.message || e) }); }
  }
  return results;
}

module.exports = { construireRecap, envoyerRecaps, envoyerA, destinataires, frDate };
