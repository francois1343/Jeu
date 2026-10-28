# Soutien facultatif et référencement

Objectif : améliorer le site existant, proposer une vidéo récompensée choisie par
le joueur et permettre un soutien PayPal séparé des Coins. La configuration livrée
n’active aucun fournisseur et n’encaisse aucun paiement.

## PayPal

Dans `js/core/arcade-config.js`, renseigner soit `paypal.hostedButtonId` avec un
identifiant réel de bouton Donate, soit `paypal.donationUrl` avec un lien HTTPS
PayPal.Me ou PayPal Donate fourni par l’exploitant. Le bouton reste masqué sans
adresse valide. Un simple lien ouvre PayPal à la demande, sans charger son SDK
dans la page ni modifier la CSP. Aucun don ne crédite de Coins.

Pour créer un bouton Donate, PayPal indique de vérifier l’éligibilité depuis le
[créateur de boutons](https://www.paypal.com/donate/buttons).
[Documentation PayPal](https://developer.paypal.com/sdk/donate/).

## Publicité récompensée

La section apparaît seulement lorsque `rewardedAds.enabled` est vrai et qu’un
adaptateur fournisseur expose `window.ArcadeRewardedAdProvider.show`.
Le bouton est volontaire, ne démarre pas automatiquement et demande un compte
Arcade connecté. L’adaptateur reçoit `{userId, placement}` et renvoie une promesse
avec `{completed: true}` uniquement si la vidéo est terminée.

Ce résultat navigateur ne crédite jamais le portefeuille. Le fournisseur ou son
relais de confiance doit valider la vue et appeler le callback signé décrit dans
[`DEPLOIEMENT-ARCADE.md`](DEPLOIEMENT-ARCADE.md). Après la vidéo, le frontend ne
fait qu’actualiser le compte ; il annonce une validation en attente.

Google H5 Games Ads est une possibilité à examiner, sur candidature avec compte
AdSense approuvé. Son callback `adViewed` navigateur ne remplace pas à lui seul
la preuve serveur exigée par cette architecture. Le choix du fournisseur et le
relais restent donc à implémenter et à tester avant activation. La CSP devra
alors être adaptée aux seuls domaines nécessaires, et la présentation de la
confidentialité/du consentement devra correspondre aux services réellement actifs.
Cette modification ne prétend pas fournir cette activation commerciale complète.

Références : [accès H5 Games Ads](https://developers.google.com/ad-placement/docs/signup),
[API et récompenses](https://developers.google.com/ad-placement/apis).

## Référencement à l’adresse actuelle

```powershell
$env:ARCADE_SITE_URL = "https://francois1343.github.io/Jeu/"
npm run seo:sitemap
```

Le générateur accepte les sous-chemins, produit les URL canoniques et sociales,
le sitemap et l’adresse de l’image de partage. L’administration, les pages d’état
et les pages déclarées `noindex` sont exclues du sitemap.

Sur GitHub Pages, `/Jeu/robots.txt` n’est pas le fichier à la racine de l’hôte que
les moteurs consultent. Soumettre directement
`https://francois1343.github.io/Jeu/sitemap.xml` dans Search Console, ou gérer la
déclaration depuis le site racine si l’exploitant le contrôle. Le sitemap et les
liens restent utiles sans cette déclaration. Le référencement réel se mesure
ensuite dans Search Console et à partir des visites et retours des joueurs.

[Emplacement de robots.txt](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt),
[guide SEO Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).
