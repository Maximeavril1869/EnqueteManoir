# EnqueteManoir 🕵️

Un jeu d'enquête de déduction pour **2 à 6 détectives**, qui tourne entièrement dans le navigateur (PWA pour iPad et iPhone, sans compte, sans serveur de jeu). Règles du jeu d'enquête classique : un crime a été commis dans un manoir, il faut trouver **qui**, **avec quelle arme** et **dans quelle pièce**.

> Les personnages sont des créations originales (couleurs des pions classiques, noms inventés). Le plateau est une recréation proche du plateau classique, pas une copie case par case.

## Jouer

Adresse (GitHub Pages) : `https://maximeavril1869.github.io/EnqueteManoir/`

**Installer sur l'iPad / l'iPhone :** ouvrir l'adresse dans Safari → bouton Partager → « Sur l'écran d'accueil ». Le jeu fonctionne ensuite hors ligne (sauf le mode téléphones, qui a besoin du wifi).

## Modes de jeu

| Mode | Principe |
|---|---|
| **Passe-passe** | Un seul écran. À chaque tour, un écran « Passe l'iPad à… » masque tout ; le joueur appuie sur « Je suis… » pour voir ses cartes. |
| **Face à face** | 2 humains de part et d'autre de l'iPad posé à plat. Les cartes restent cachées tant qu'on **maintient** le bouton œil. |
| **Téléphones** | L'iPad est le plateau commun ; chaque joueur a ses cartes, son carnet et ses actions sur son téléphone. Connexion par code à 4 chiffres (ou QR code), ou par copier-coller en secours. |

Dans tous les modes, chaque place peut être **Humain**, **Ordi** (Débutant / Moyen / Expert) ou **Absente** (son pion reste sur le plateau et peut être convoqué par une suggestion).

## Règles implémentées

- 21 cartes : 6 suspects, 6 armes, 9 pièces. Une de chaque type dans le dossier confidentiel, les 18 autres distribuées.
- Tour : lancer 2 dés, se déplacer du nombre exact de cases (pas de demi-tour sur une case, pas de traversée d'un pion), entrer dans une pièce par une porte (même avec des pas en trop), ou prendre le **passage secret** (Cuisine ⇄ Bureau, Véranda ⇄ Salon).
- **Suggestion** dans la pièce où l'on se trouve : le suspect et l'arme sont convoqués, puis les joueurs, dans le sens des aiguilles d'une montre, montrent une carte en secret. Le suspect convoqué peut rester dans la pièce au tour suivant pour suggérer sans lancer les dés.
- **Accusation** à tout moment du tour : exacte = victoire ; fausse = élimination (le joueur éliminé continue de réfuter). Le dernier joueur en lice gagne.
- **Carnet de déduction** intégré, avec une **aide automatique** (désactivable) qui déduit ce qui est certain à partir de ce que le joueur a le droit de savoir.

## Tests

```
npm test
```

Les tests couvrent le plateau, la distribution, les déplacements, les suggestions et accusations, l'exactitude des déductions, des parties 100 % ordinateur, et le protocole du mode téléphones (avec de fausses connexions). Voir `ARCHITECTURE.md` et `CARNET_DE_BORD.md`.

## Fichiers du projet

- `ARCHITECTURE.md` — organisation du code et échanges entre appareils.
- `CARNET_DE_BORD.md` — journal de toutes les opérations réalisées sur le projet.

## Licence

© 2026 Maximeavril1869 — **Tous droits réservés.** Voir le fichier `LICENSE`. Les bibliothèques tierces de `js/vendor/` (PeerJS, qrcode-generator, licence MIT) gardent leur licence d'origine.
