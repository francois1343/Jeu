# Structure du projet

Le site reste une application statique HTML, CSS et JavaScript. La racine ne contient que les
points d’entrée et la configuration du projet :

```text
index.html                 accueil de l’arcade
manifest.webmanifest       manifeste PWA
service-worker.js          cache du site
games/<jeu>/index.html     page autonome de chaque jeu
css/home.css               styles de l’accueil
css/shared/                styles communs aux jeux
js/home.js                 interactions de l’accueil
js/core/                   Coins, sessions et communication inter-jeux
assets/icons/              icônes et ressources graphiques communes
js/legacy/ · css/legacy/   anciens prototypes, isolés sans être supprimés
docs/ · tests/ · supabase/ documentation, validation et backend préparé
```

Un nouveau jeu doit être ajouté dans son propre dossier `games/<slug>/` : son `index.html`, ses
styles et ses scripts restent regroupés. Il charge les composants communs avec des chemins relatifs
vers `../../js/core/` et utilise `../../index.html` pour revenir à l’accueil.

L’accueil référence uniquement `games/<slug>/index.html`. Les ressources globales ne doivent pas
être copiées dans les dossiers de jeu : elles appartiennent à `css/shared/`, `js/core/` ou
`assets/` selon leur nature.
