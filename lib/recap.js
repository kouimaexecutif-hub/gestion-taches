// Construction du texte de récap + envoi WhatsApp via Twilio

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

async function envoyerWhatsApp(settings, texte) {
  const sid = settings.twilioSid, token = settings.twilioToken;
  let from = settings.twilioFrom, to = settings.whatsappDest;
  if (!sid || !token || !from || !to) {
    throw new Error('Configuration Twilio incomplète (SID, jeton, numéro émetteur ou destinataire manquant).');
  }
  // Normalisation : on garantit le préfixe "whatsapp:"
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
  if (!r.ok) {
    throw new Error('Twilio: ' + (data.message || ('erreur ' + r.status)));
  }
  return { sid: data.sid, status: data.status };
}

module.exports = { construireRecap, envoyerWhatsApp, frDate };
