# EnqueteManoir 🕵️

Un jeu d'enquête de déduction pour **2 à 6 détectives**, qui tourne dans le navigateur (PWA pour iPad et iPhone) : en solo sans compte ni réseau, en ligne à deux avec le compte commun à tous mes jeux. Règles du jeu d'enquête classique : un crime a été commis dans un manoir, il faut trouver **qui**, **avec quelle arme** et **dans quelle pièce**.

> Les personnages sont des créations originales (couleurs des pions classiques, noms inventés). Le plateau est une recréation proche du plateau classique, pas une copie case par case.

## Jouer

Adresse (GitHub Pages) : `https://maximeavril1869.github.io/EnqueteManoir/`

**Installer sur l'iPad / l'iPhone :** ouvrir l'adresse dans Safari → bouton Partager → « Sur l'écran d'accueil ». Le solo fonctionne ensuite hors ligne ; le mode En ligne a besoin d'internet.

## Modes de jeu

| Mode | Principe |
|---|---|
| **Solo** | 1 humain contre 1 à 5 ordinateurs (Débutant / Moyen / Expert), sur un seul appareil, sans compte. Partie sauvegardée automatiquement. |
| **En ligne** | 2 humains, **chacun sur son appareil** (téléphone ou iPad). Les autres places : ordinateur ou absentes. L'hôte crée la partie (code à 4 lettres), l'invité la rejoint avec ce code. |
| **Plateau** (en ligne) | Un iPad affiche la table commune en **lecture seule** (plateau, pions, suggestions publiques) ; personne ne joue dessus. Quand il est branché, les téléphones cachent la table et gardent main, carnet et boutons. |

Les anciens modes passe-passe, face à face et téléphones (PeerJS) ont été supprimés en v2.0.

Les mains et le dossier confidentiel sont cachés **par confiance** : l'état complet est dans la partie en ligne, l'écran n'affiche que ce que chacun a le droit de voir.

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

Les tests couvrent le plateau, la distribution, les déplacements, les suggestions et accusations, l'exactitude des déductions, des parties 100 % ordinateur, et l'absence de fuite dans la vue publique du plateau. Un test navigateur (`PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e/en_ligne.py`, Playwright + faux serveur en mémoire) joue deux appareils, le plateau, les conflits, la reprise, Rejouer et le solo. Voir `ARCHITECTURE.md` et `CARNET_DE_BORD.md`.

## Fichiers du projet

- `ARCHITECTURE.md` — organisation du code et échanges entre appareils.
- `CARNET_DE_BORD.md` — journal de toutes les opérations réalisées sur le projet.

## Licence

© 2026 Maximeavril1869 — **Tous droits réservés.** Voir le fichier `LICENSE`.
