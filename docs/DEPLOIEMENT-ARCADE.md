# Déploiement de la plateforme Arcade

Le site reste un frontend HTML/CSS/JavaScript statique. Supabase apporte uniquement les
comptes, la base PostgreSQL et les fonctions sécurisées nécessaires aux Coins.

## 1. Créer et relier Supabase

1. Créer un projet Supabase et conserver sa région proche du public principal.
2. Installer la CLI Supabase, puis se connecter :

   ```powershell
   npx supabase login
   npx supabase link --project-ref VOTRE_PROJECT_REF
   ```

3. Appliquer le schéma et déployer les fonctions :

   ```powershell
   npx supabase db push
   npx supabase functions deploy start-challenge
   npx supabase functions deploy settle-challenge
   npx supabase functions deploy rewarded-ad-callback --no-verify-jwt
   ```

4. Définir les origines autorisées. Séparer plusieurs domaines par une virgule :

   ```powershell
   npx supabase secrets set ALLOWED_ORIGINS=https://votre-domaine.example
   ```

Supabase fournit automatiquement les variables nécessaires à ses fonctions. La clé secrète
ou `service_role` ne doit jamais être ajoutée au frontend ou au dépôt.

## 2. Relier le frontend

Dans `arcade-config.js`, renseigner uniquement :

- `supabaseUrl` : URL publique du projet ;
- `supabasePublishableKey` : clé publique/publishable du projet.

Ces deux valeurs sont prévues pour le navigateur. Les tables exposées sont protégées par RLS,
et aucun rôle navigateur n’a le droit de modifier les portefeuilles ou transactions.

Dans Supabase Auth, ajouter l’URL finale du site aux URL de redirection et choisir si la
confirmation d’adresse e-mail est obligatoire.

## 3. Configurer les pubs récompensées

Le réseau publicitaire doit fournir une validation serveur ou passer par un relais de confiance.
Le callback fourni attend un POST JSON canonique :

```json
{
  "version": 1,
  "provider": "nom-du-fournisseur",
  "reward_id": "identifiant-unique-du-fournisseur",
  "user_id": "uuid-supabase-du-joueur",
  "placement": "arcade_home_reward",
  "completed": true
}
```

Le relais signe exactement `timestamp.corps_json_brut` avec HMAC-SHA256 et transmet :

- `x-arcade-timestamp` : timestamp Unix, valable cinq minutes ;
- `x-arcade-signature` : signature hexadécimale.

Configurer le même secret côté Supabase :

```powershell
npx supabase secrets set REWARDED_AD_WEBHOOK_SECRET=UNE_VALEUR_LONGUE_ET_ALEATOIRE
```

Enfin, installer l’adaptateur JavaScript du fournisseur sous la forme
`window.ArcadeRewardedAdProvider.show({ userId, placement })`, puis mettre
`rewardedAds.enabled` à `true` dans `arcade-config.js`. La fin de l’affichage ne crédite rien
directement : seul le callback signé ajoute les Coins.

## 4. Configurer le don PayPal

Créer un bouton Donate dans PayPal, copier son `hosted_button_id`, puis le renseigner dans
`arcade-config.js`. Le don est présenté séparément et ne crée aucune transaction de Coins.

## 5. Publier progressivement

1. Déployer d’abord le backend et vérifier deux comptes de test.
2. Publier l’accueil avec les fonctions Coins activées.
3. Contrôler les trois défis, les doublons de requêtes et les limites quotidiennes.
4. Activer les pubs uniquement après validation du webhook en environnement de test.
5. Migrer les jeux selon `docs/MIGRATION-JEUX.md`.

## Contrôles avant production

- Une clé secrète Supabase ne doit apparaître dans aucun fichier frontend.
- Un utilisateur ne doit pouvoir lire que son portefeuille et son historique.
- Deux règlements du même `session_id` ne doivent créditer qu’une seule fois.
- Deux callbacks avec le même `provider_reward_id` ne doivent créditer qu’une seule fois.
- Les origines de production doivent être les seules présentes dans `ALLOWED_ORIGINS`.
- Les sauvegardes et alertes de la base doivent être activées avant une audience importante.
