# Yucan Prospection

Application de prospection LinkedIn assistée par l'IA, aux couleurs de Yucan Marketing digital.

- **Application web** (Next.js sur Vercel + Supabase) : comptes, prospects, scénarios, analyse de profil et rédaction de messages par l'IA (clé Claude ou OpenAI de l'utilisatrice), validation des messages, statistiques.
- **Extension Chrome** (`extension/`) : exécute les actions LinkedIn (visite, invitation, message) dans le navigateur de l'utilisatrice, dans sa session LinkedIn. Le mot de passe LinkedIn n'est jamais demandé.

## Fonctionnement

```
Application (Vercel)  ←→  Supabase (données, RLS)
        ↑  « prochaine action ? » / résultat
Extension Chrome  →  onglet LinkedIn de l'utilisatrice
```

Le moteur de scénarios vit côté serveur (`src/lib/engine.ts`). Chaque minute, l'extension appelle `POST /api/extension/next`. Le serveur vérifie la pause, les horaires, les limites du jour et le délai entre deux actions, puis renvoie au plus une action. L'extension l'exécute et renvoie le résultat à `POST /api/extension/report`.

## Installation

1. Créez un projet Supabase et appliquez `supabase/migrations/0001_init.sql`.
2. Copiez `.env.example` en `.env.local` et remplissez les clés.
3. `npm install` puis `npm run dev`.
4. Sur Vercel, importez le dépôt et ajoutez les trois variables d'environnement.
5. Dans Supabase → Authentication → URL Configuration, mettez l'adresse Vercel comme *Site URL*.

## Extension

`./scripts/pack-extension.sh` régénère `public/yucan-extension.zip`, téléchargeable depuis Réglages → Extension Chrome.

## Sécurité du compte LinkedIn

LinkedIn interdit l'automatisation dans ses conditions d'utilisation. L'application limite le risque avec des quotas quotidiens, des horaires, des pauses aléatoires et un arrêt automatique en cas de vérification de sécurité, mais elle ne le supprime pas.
