# Passage a une architecture server-first

Le navigateur ne doit jamais etre l'autorite pour les Coins, les recompenses ou les scores
publics. Il affiche un etat fourni par Supabase, mais seules PostgreSQL et les Edge Functions
peuvent creer une transaction, valider une partie ou crediter un portefeuille.

## Etat actuel du projet

Le socle serveur existe deja :

- tables `profiles`, `wallet_accounts`, `wallet_transactions`, `game_catalog`, `game_sessions`
  et `reward_claims` ;
- RLS activee et droits d'ecriture retires aux roles navigateur ;
- transactions de portefeuille immuables et operations idempotentes ;
- fonctions `start-challenge`, `settle-challenge` et `rewarded-ad-callback` ;
- trois defis dont la solution reste sur le serveur.

Le frontend utilise encore `mode: "local-test"`. Les Coins locaux sont donc fictifs et ne
doivent jamais etre importes vers un vrai portefeuille.

## Etape 1 - Creer le projet Supabase

1. Creer un projet distinct de production dans le tableau de bord Supabase.
2. Choisir une region europeenne proche du public principal.
3. Generer un mot de passe de base long et le conserver dans un gestionnaire de mots de passe.
4. Relever le `Project ref`, l'URL publique et la cle **publishable**.
5. Ne jamais copier dans le frontend, dans Git ou dans une conversation la cle `secret`, la cle
   `service_role` ou le mot de passe de la base.

Le `Project ref`, l'URL et la cle publishable ne donnent pas de droits administrateur : ils sont
prevus pour le navigateur lorsque la RLS est correctement configuree.

## Etape 2 - Relier le depot au projet distant

Depuis la racine du projet :

```powershell
npm install
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF
npm run supabase:dry-run
```

Lire la previsualisation avant d'appliquer quoi que ce soit. Si elle correspond uniquement a la
migration attendue :

```powershell
npm run supabase:push
npm run supabase:deploy
npx supabase secrets set ALLOWED_ORIGINS=https://votre-domaine.example,http://127.0.0.1:4173
```

La commande de deploiement utilise l'API Supabase et ne demande pas Docker. Docker Desktop est
necessaire uniquement pour lancer toute la pile Supabase localement avec `npm run supabase:start`.

## Etape 3 - Configurer Auth

Dans Supabase Auth :

1. definir l'URL officielle du site ;
2. ajouter les URL de redirection de production et de test ;
3. activer la confirmation d'adresse e-mail pour la production ;
4. regler les limites d'envoi et connecter un SMTP avant l'ouverture publique ;
5. conserver les controles anti-abus et ajouter un CAPTCHA si les inscriptions sont publiques.

Le premier branchement frontend utilisera e-mail + mot de passe et un pseudo public. Les
preferences visuelles pourront rester locales ; l'identite, le portefeuille et l'historique
economique viendront du serveur.

## Etape 4 - Basculer le compte et le portefeuille

Ordre de migration :

1. charger le client Supabase depuis un fichier local au site ;
2. remplacer le formulaire de pseudo local par inscription, connexion et deconnexion Supabase ;
3. lire `profiles`, `wallet_accounts` et `wallet_transactions` avec le JWT de l'utilisateur ;
4. afficher le solde serveur en lecture seule ;
5. garder `ArcadeLocalStore` seulement pour les preferences et les records non certifies ;
6. ne fournir aucune fonction frontend permettant de modifier un solde.

Le mode `local-test` reste actif jusqu'a ce que ce parcours soit entierement teste. La bascule
vers `mode: "supabase"` se fera ensuite en une seule modification de configuration.

## Etape 5 - Valider les jeux, un par un

Un score envoye par le navigateur n'est jamais une preuve. Chaque jeu doit choisir un modele :

- **validation directe** : le serveur cree la question, le plateau ou la sequence et garde la
  solution ;
- **rejeu deterministe** : le serveur fournit une graine et rejoue le journal des commandes ;
- **serveur temps reel** : le serveur controle directement l'etat d'une partie multijoueur ;
- **entrainement** : aucun Coin et aucun classement global tant que le resultat reste local.

Commencer par Calcul Mental est le chemin le plus simple. Le serveur genere les questions, garde
les reponses, impose une duree minimale, puis calcule lui-meme le score et le gain.

## Etape 6 - Classements certifies

Le classement global devra etre alimente uniquement lors du reglement serveur d'une session.
Le client pourra le lire, mais pas inserer ni modifier une ligne. Un score local restera marque
`local` et ne sera jamais melange avec un score `verified`.

## Etape 7 - Recette avant production

- deux comptes ne peuvent lire que leurs propres portefeuilles et historiques ;
- une meme requete rejouee ne debite ou ne credite qu'une fois ;
- un score invente dans DevTools ne produit aucun Coin ni classement ;
- les sessions expirees et trop rapides sont refusees ;
- aucune cle `secret` ou `service_role` n'apparait dans les ressources du navigateur ;
- les sauvegardes, alertes, journaux et limites de depense Supabase sont configures.

Executer avant chaque deploiement :

```powershell
npm run security:check
npm test
```

## Prochaine action

Creer le projet Supabase, puis communiquer uniquement le `Project ref`, l'URL publique et la cle
publishable. La phase suivante sera le raccordement Auth et portefeuille, sans activer encore les
Coins sur les jeux non verifies.
