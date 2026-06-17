# Guide d'installation — Application de gestion des tâches journalières

Application web de suivi des tâches avec **récap WhatsApp automatique chaque matin à 07h00**.
Pensée pour être installée et configurée par une personne **non technique**, et **revendable** : toute la configuration se fait depuis la page « Configuration » de l'application, sans toucher au code.

---

## Ce que contient le dossier

| Fichier / dossier | Rôle |
|---|---|
| `index.html` | La page principale : tableau des tâches |
| `config.html` | La page Configuration (nom, numéro WhatsApp, clés d'envoi) |
| `api/tasks.js` | Sauvegarde / lecture des tâches |
| `api/settings.js` | Sauvegarde / lecture de la configuration (secrets protégés) |
| `api/cron.js` | Envoi automatique du récap chaque matin |
| `api/test.js` | Bouton « Envoyer un test » |
| `lib/store.js` | Stockage des données |
| `lib/recap.js` | Texte du récap + envoi WhatsApp via Twilio |
| `vercel.json` | Planification de l'envoi (07h00, heure du Gabon) |

Les colonnes du tableau : **Tâche · Description · Comment réaliser la tâche · Avec quelles ressources · Priorité · Date de début · Date d'échéance · État · % terminé · Notes**.

---

## Étape 1 — Mettre le code sur GitHub (navigateur, gratuit)

1. Créer un compte sur **github.com** (bouton « Sign up »).
2. Cliquer sur **New repository** (nouveau dépôt). Nom au choix, ex : `gestion-taches`. Laisser « Public » ou « Private ». Cliquer **Create repository**.
3. Sur la page du dépôt : **Add file → Upload files**.
4. **Glisser-déposer tous les fichiers du dossier** (y compris les dossiers `api` et `lib`). Cliquer **Commit changes**.

> Aucune commande à taper : tout se fait dans le navigateur.

## Étape 2 — Mettre en ligne avec Vercel (navigateur, gratuit)

1. Aller sur **vercel.com**, cliquer **Sign Up**, choisir **Continue with GitHub**.
2. Cliquer **Add New… → Project**.
3. Choisir le dépôt `gestion-taches` → **Import**.
4. Ne rien changer, cliquer **Deploy**. Attendre ~1 minute.
5. Vercel affiche un lien du type `https://gestion-taches-xxx.vercel.app` : **c'est votre application.**

## Étape 3 — Activer le stockage permanent (pour que les données restent)

1. Dans Vercel, ouvrir le projet → onglet **Storage**.
2. Cliquer **Create Database → Upstash (Redis / KV)** → **Continue** → **Connect**.
3. Vercel ajoute automatiquement les clés nécessaires. Aller dans **Deployments**, ouvrir le dernier, **Redeploy** (pour prendre en compte le stockage).

> Sans cette étape, l'application fonctionne pour faire un essai, mais les tâches ne sont pas conservées durablement.

## Étape 4 — Choisir la méthode d'envoi WhatsApp

L'application propose deux méthodes (à choisir dans la page Configuration) :

**Option A — CallMeBot (GRATUIT, recommandé pour usage personnel)**
1. Dans WhatsApp, ajouter le contact **+34 621 371 153**.
2. Lui envoyer le message exact : `I allow callmebot to send me messages`
3. On reçoit en réponse une **clé API** (un nombre). La copier.
4. Dans la page Configuration : méthode **CallMeBot**, coller la clé. C'est tout.

*Note : l'API gratuite de CallMeBot est réservée à un usage personnel.*

**Option B — Twilio (professionnel, pour un usage commercial/multi-clients)**
1. Aller sur **twilio.com/try-twilio**, créer un compte (crédits offerts puis payant).
2. Console : **Messaging → Try it out → Send a WhatsApp message**, rejoindre le bac à sable.
3. Noter **Account SID** et **Auth Token**, et le numéro émetteur (souvent **+14155238886**).
4. Dans la page Configuration : méthode **Twilio**, coller les valeurs.

## Étape 5 — Configurer l'application (page Configuration)

1. Ouvrir votre application, cliquer **⚙ Configuration** en haut à droite.
2. Choisir un **code administrateur** (à retenir).
3. Renseigner : nom de l'entreprise, **numéro WhatsApp destinataire** (format `+241...`).
4. Coller **Account SID**, **Auth Token**, et le numéro émetteur Twilio (`+14155238886` pour le bac à sable).
5. Cliquer **Enregistrer**, puis **📲 Envoyer un test WhatsApp**. Vous devez recevoir le message sur WhatsApp.

C'est terminé : chaque matin à 07h00, le récap part automatiquement.

---

## Notes pour la commercialisation

- **Aucune ligne de code à modifier** pour un nouveau client : il déploie le dossier, puis remplit la page Configuration.
- Les secrets (jeton Twilio, code admin) ne sont **jamais** renvoyés au navigateur.
- Le bac à sable Twilio est gratuit mais limité (le destinataire doit avoir rejoint le sandbox). Pour un usage professionnel sans restriction, activer un **numéro WhatsApp Business** payant chez Twilio — la configuration dans l'application reste identique.
- L'heure d'envoi (07h00, heure du Gabon = 06h00 UTC) est dans `vercel.json`. Pour une autre heure, modifier la ligne `"schedule"` (format `minute heure * * *`, en UTC) et redéployer.
