# PWA Arcade Station

L’accueil charge `manifest.webmanifest`, enregistre `service-worker.js` et affiche une invitation
d’installation discrète uniquement lorsqu’elle est pertinente.

## Installation

- Chrome, Edge et les navigateurs Android compatibles reçoivent le dialogue natif après un clic sur
  **Installer** ;
- sur iOS Safari, le bouton affiche l’instruction **Partager → Sur l’écran d’accueil** ;
- en mode `standalone` ou après l’événement `appinstalled`, aucune invitation ne réapparaît.

La décision d’attendre est stockée localement sous la clé
`arcade.pwa-install-prompt.v1`. Elle ne contient que le nombre de visites, le nombre de reports et
des dates techniques ; aucune donnée personnelle ni donnée de compte n’est enregistrée.

## Paramètres

Les réglages sont regroupés dans `js/pwa-config.js` : délai avant affichage, nombre minimum de
visites, délai initial de report, augmentation du délai et plafond. Les modifier ici évite de
disperser ces règles dans l’interface.

## Cache et mises à jour

Le service worker précharge le noyau de l’accueil et les icônes. Les pages de jeux et ressources
consultées sont ensuite conservées pour accélérer les visites suivantes et permettre une utilisation
hors connexion lorsque les ressources ont déjà été ouvertes.

Une nouvelle version reste en attente sans interrompre une partie. Lorsqu’elle est détectée sur
l’accueil, un bouton **Mettre à jour** l’active puis recharge l’accueil. À chaque changement de
cache, augmenter la version `CACHE` dans `service-worker.js`.

Les icônes PNG sont générées à partir de l’identité graphique existante par
`scripts/generate-pwa-icons.js` :

```powershell
npm run pwa:icons
```
