# Réconciliation Arcade — 4 novembre 2026

La branche `fix/arcade-reconciliation` repart de GitHub `03957fb0ce11e930afb4c7932c5f05829f546b33`. La copie du Bureau reposait sur `0e519a45745c34e6abb2c5c9796ecd4c4b2622e2` avec 51 fichiers suivis modifiés et deux fichiers non suivis. Une archive complète, contrôlée par empreintes, précède la réconciliation. La copie du Bureau reste intacte.

Les 47 modifications HTML locales ajoutaient uniquement les métadonnées de déploiement. Cinq de ces pages avaient également évolué sur GitHub pour la navigation mobile. Les pages GitHub sont conservées ; le générateur SEO local et ses tests sont intégrés, puis les métadonnées sont régénérées dans la sortie Web. Aucun ancien corps de page ne remplace l'interface récente.

## Build et hébergements

`npm ci --ignore-scripts`, puis `npm run build`, produisent `dist/`. Le build ne modifie pas les sources, supprime seulement son ancienne sortie `dist/` après contrôle du chemin et refuse les liens symboliques. Une liste explicite sélectionne les fichiers Web, les licences et les ressources des jeux. Les documents, scripts, tests, migrations SQL, exports techniques racine et dépendances restent hors publication. Le lien « Guide » pointe vers le README GitHub. Les imports manuels de l'ancien outil d'audit local restent disponibles dans les sources ; ses exports racine ne sont pas distribués par le site.

- Vercel : `vercel.json` définit `outputDirectory: dist`. Origine canonique par défaut : `https://jeu-sand-delta.vercel.app/`.
- GitHub Pages : le workflow `deploy-pages.yml` teste et construit `dist/` avec `ARCADE_SITE_URL=https://francois1343.github.io/Jeu/`, puis publie l'artefact. Le dépôt doit utiliser le mode Pages « GitHub Actions ».
- Toute autre origine doit être fournie via `ARCADE_SITE_URL`, en HTTPS. Les sous-chemins sont conservés. Les commandes `seo:meta` et `seo:sitemap` ciblent `dist/` par défaut et acceptent un répertoire explicite en premier argument.

Le sitemap comprend 47 pages publiques : accueil, 43 jeux et trois pages légales. Il exclut les pages admin, 404 et hors ligne. Les liens canoniques et `robots.txt` suivent l'origine de chaque build. Le cache PWA passe à v74 afin d'actualiser le document d'accueil et les métadonnées.

## Vérifications reproductibles

- `npm test` : contrôles existants, tests de sous-chemin du sitemap et contrat du build (sortie, répétabilité, ressources, conservation des sources et des corps HTML).
- `npm run build` : build de production Vercel.
- `ARCADE_STATIC_DIR=dist` pour les tests de liens ou de découverte mobile ; `ARCADE_BASE_URL` permet de tester un serveur déjà démarré. La recette mobile nécessite `CHROME_PATH`.
- Pilotes : Crossy Turfu, 421 Duel, Dés de Bohême, River Room Poker, Cyber-Core Sorter, Pixel Taquin. Vérifier les routes, les interactions et la navigation sur les tailles cibles après publication.

Les contrôles statiques ne prouvent pas le fonctionnement des services Supabase, des comptes ou du multijoueur distant. Aucune modification de ces services n'est incluse dans ce lot.
