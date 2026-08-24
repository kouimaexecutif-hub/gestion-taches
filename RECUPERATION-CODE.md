# Retrouver ou remettre à zéro le code d'accès

Le registre des tâches et la page Configuration sont derrière un code. Il n'est
écrit nulle part dans le dépôt — c'est voulu. Voici les trois façons d'entrer.

## 1. La porte de secours : `ADMIN_CODE` dans Vercel (le plus simple)

1. [vercel.com](https://vercel.com) → projet **gestion-taches**
2. **Settings** → **Environment Variables**
3. Ajouter : nom `ADMIN_CODE`, valeur = le code de votre choix,
   environnement **Production**
4. **Redeploy** (onglet Deployments → ⋯ sur le dernier → Redeploy)
5. Ce code ouvre l'application. Celui de la base continue de fonctionner aussi.

C'est la voie à privilégier : elle se lit, se change et se supprime depuis une
interface que vous maîtrisez, sans toucher à la base.

## 2. Lire le code existant, dans la base

1. vercel.com → projet **gestion-taches** → onglet **Storage**
2. Ouvrir la base Upstash Redis liée → **Data Browser**
3. Clé **`settings`** → dans le JSON, lire le champ `"adminCode"`

## 3. Le remettre à zéro, dans la base

Dans le même Data Browser, éditer la clé `settings` et **supprimer la ligne**
`"adminCode": "…"`, puis enregistrer.

> **À faire d'une traite.** Tant qu'aucun code n'est défini — ni dans la base,
> ni dans `ADMIN_CODE` — l'API est OUVERTE : le registre redevient lisible et
> modifiable par n'importe qui. Enchaînez immédiatement sur `/config.html` pour
> définir un nouveau code ; la porte se referme à l'enregistrement.

## Pourquoi le code n'est pas dans le dépôt

Le dépôt est privé, mais un secret versionné finit toujours par circuler — dans
une copie, une capture d'écran, un correctif transmis. Le code vit donc soit
dans la base, soit dans les variables d'environnement Vercel, jamais dans les
fichiers.

## Ce que le code protège

`/api/tasks` en lecture et en écriture, et `/api/settings` en lecture. Avant le
24/08/2026 ces trois accès étaient ouverts : n'importe qui pouvait lire le
registre — dont les titres nomment les clients du cabinet — le réécrire, et y
déposer du balisage qui s'exécutait ensuite dans le navigateur du cabinet.

Un seul code, partagé : il protège d'un inconnu qui trouve l'adresse, pas d'un
collaborateur qui le divulguerait.
