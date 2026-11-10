# Carnet de bord — EnqueteManoir

Journal des opérations réalisées sur le projet, pour reprendre le travail là où il s'est arrêté.

## État actuel

Version **1.0** livrée : jeu complet jouable (3 modes, 3 niveaux d'ordi, carnet avec aide), documentation, tests.
Points à valider par le propriétaire sur de vrais appareils : voir « À faire ».

## Décisions prises avec le propriétaire (10 novembre 2026)

- Nom du projet : `EnqueteManoir` (le nom « Cluedo » est une marque d'un éditeur ; dépôt public).
- 2 à 6 joueurs, règles du jeu d'enquête classique, manoir classique, carnet de déduction intégré avec aide automatique.
- Tous les modes : passe-passe, face à face, téléphones, ordi à plusieurs niveaux (comme ses autres jeux).
- Mention « Tous droits réservés » (fichier `LICENSE` + section Licence du README).
- Mode téléphones : liaison WebRTC directe, avec secours manuel (confiance accordée avant tout test réel).

## Journal

### 10–11 novembre 2026 — création du projet

1. Connexion du dépôt `Maximeavril1869/enquetemanoir` (contenu initial : un README d'une ligne).
2. `js/data.js` : 6 personnages originaux, 6 armes, 9 pièces, grille 24×25, 17 portes, passages secrets (Cuisine ⇄ Bureau, Véranda ⇄ Salon), cartes.
3. `js/engine.js` : état sérialisable, distribution, déplacements (nombre exact de cases, pas de croisement), suggestions et réfutation dans l'ordre horaire, accusation, élimination, vues par joueur.
4. `js/knowledge.js` : déduction par propagation de contraintes (3 niveaux de finesse).
5. `js/ai.js` : ordi à 3 niveaux. Mesure sur parties simulées : Débutant ≈ 30 tours/joueur, Moyen ≈ 7, Expert ≈ 5 ; l'Expert gagne nettement plus souvent que le Moyen.
6. `js/ui.js`, `css/style.css` : plateau SVG, panneau du joueur, fenêtres de suggestion/accusation, carnet, passe-passe (écran de passage), face à face (panneau retourné, cartes à maintenir), téléphone (plateau défilant).
7. `js/net.js` : salon hôte, client, places, reprise après déconnexion, secours par copier-coller.
8. `js/main.js` : écrans, sauvegarde automatique (« Reprendre la partie »), tours de l'ordi, notes du carnet.
9. PWA : `manifest.webmanifest`, `sw.js` (hors ligne), icônes générées. PeerJS et qrcode-generator copiés dans `js/vendor/`.
10. Tests Node (`npm test`) : 15 tests, tous passés (plateau, distribution, déplacements, suggestions, accusations, parties 100 % ordi avec vérification que les déductions ne se trompent jamais, protocole des téléphones).
11. Tests navigateur (Chromium) : parties complètes en passe-passe, face à face et avec l'ordi ; partie complète avec un iPad hôte et 2 téléphones simulés connectés en WebRTC réel via la connexion manuelle ; captures iPad paysage/portrait et téléphone vérifiées.
12. Corrections trouvées pendant les tests : conservation des champs de saisie du salon entre deux rendus ; vidage du champ d'invitation avant d'en créer une nouvelle ; messages d'erreur du courtier traduits en français ; plateau de téléphone agrandi et centré sur le pion ; **plateau rendu cliquable uniquement quand c'est à un humain de jouer** (auparavant, un tap pendant le tour de l'ordi pouvait déplacer le pion de l'ordi).
13. Documentation : `README.md`, `ARCHITECTURE.md`, `LICENSE`.

## À faire / à valider

- [ ] Activer GitHub Pages sur le dépôt (branche `main`, dossier racine) si ce n'est pas déjà fait.
- [ ] Tester le mode téléphones sur de vrais appareils (iPad + iPhone, même wifi) : code à 4 chiffres, QR code, reprise après déconnexion. Non testé ici : le courtier PeerJS est inaccessible depuis l'environnement de développement.
- [ ] Vérifier le ressenti du plateau sur iPad (taille des cases, lisibilité en face à face).
- [ ] Idées non réalisées : animation des déplacements, sons, historique détaillé des suggestions dans le carnet, relier le mode téléphone aux autres jeux.
