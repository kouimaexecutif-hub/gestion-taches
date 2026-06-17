// Construction du texte de récap + envoi WhatsApp (CallMeBot gratuit ou Twilio)

function frDate(d) {
  if (!d) return '—';
  const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function construireRecap(tasks, settings) {
  const nom = (settings && settings.nomEntreprise) ? settings.nomEntreprise : 'Tâches journalières';
  const today = new Date().toISOString().slice(0, 10);
  const actives = tasks.filter(t => t.etat !== 'Terminé');
  const base = actives.length ? actives : tasks;

  let txt = `*${nom} — Récap du ${frDate(today)}*\n\n`;
  if (!base.length) { txt += 'Aucune tâche enregistrée pour le moment.'; return txt; }

  const ordre = { 'Haute': 0, 'Moyenne': 1, 'Basse': 2 };
  const tri = [...base].sort((a, b) => (ordre[a.priorite] ?? 1) - (ordre[b.priorite] ?? 1));

  tri.forEach(t => {
    const flag = t.priorite === 'Haute' ? ' ⚠️' : '';
    let ligne = `• ${t.tache} — ${t.etat} (${t.progres || 0}%)${flag}`;
    if (t.echeance) ligne += `\n   échéance : ${frDate(t.echeance)}`;
    txt += ligne + '\n';
  });

  const moy = Math.round(base.reduce((s, t) => s + (+t.progres || 0), 0) / base.length);
  const termine = tasks.filter(t => t.etat === 'Terminé').length;
  txt += `\nAvancement moyen : ${moy}%`;
  txt += `\nTerminées : ${termine}/${tasks.length}`;
  return txt;
}

// --- CallMeBot (gratuit, usage personnel) ---
async function envoyerCallMeBot(settings, texte) {
  const phone = (settings.callmebotPhone || settings.whatsappDest || '').replace(/\s/g, '');
  const apikey = settings.callmebotApikey;
  if (!phone || !apikey) {
    throw new Error('Configuration CallMeBot incomplète (numéro WhatsApp ou clé API manquant).');
  }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(texte)}&apikey=${encodeURIComponent(apikey)}`;
  const r = await fetch(url);
  const body = (await r.text().catch(() => '')) || '';
  if (!r.ok) throw new Error('CallMeBot (' + r.status + ') : ' + body.replace(/<[^>]*>/g, ' ').trim().slice(0, 180));
  if (/apikey|not\s*valid|invalid|error|wrong/i.test(body) && !/queued|sent|success|processed/i.test(body)) {
    throw new Error('CallMeBot : ' + body.replace(/<[^>]*>/g, ' ').trim().slice(0, 180));
  }
  return { status: 'envoyé' };
}

// --- Twilio (option professionnelle / commerciale) ---
async function envoyerTwilio(settings, texte) {
  const sid = settings.twilioSid, token = settings.twilioToken;
  let from = settings.twilioFrom, to = settings.whatsappDest;
  if (!sid || !token || !from || !to) {
    throw new Error('Configuration Twilio incomplète (SID, jeton, numéro émetteur ou destinataire manquant).');
  }
  const norm = v => v.startsWith('whatsapp:') ? v : 'whatsapp:' + v.replace(/\s/g, '');
  from = norm(from); to = norm(to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: to, Body: texte });
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Twilio: ' + (data.message || ('erreur ' + r.status)));
  return { status: data.status || 'envoyé', sid: data.sid };
}

// Choix automatique de la méthode d'envoi
async function envoyerWhatsApp(settings, texte) {
  const methode = settings.methode || (settings.callmebotApikey ? 'callmebot' : 'twilio');
  if (methode === 'twilio') return envoyerTwilio(settings, texte);
  return envoyerCallMeBot(settings, texte);
}

module.exports = { construireRecap, envoyerWhatsApp, envoyerCallMeBot, envoyerTwilio, frDate };
