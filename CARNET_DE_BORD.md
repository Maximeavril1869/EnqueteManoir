# Carnet de bord — EnqueteManoir

Journal des opérations réalisées sur le projet, pour reprendre le travail là où il s'est arrêté.

## État actuel

Version **2.0** livrée (13 novembre 2026) : solo + mode En ligne (2 humains) + plateau iPad ; anciens modes passe-passe / face à face / téléphones PeerJS supprimés.
Points à valider par le propriétaire sur de vrais appareils : voir « À faire ».

## Décisions prises avec le propriétaire (10 novembre 2026)

- Nom du projet : `EnqueteManoir` (le nom « Cluedo » est une marque d'un éditeur ; dépôt public).
- 2 à 6 joueurs, règles du jeu d'enquête classique, manoir classique, carnet de déduction intégré avec aide automatique.
- Tous les modes : passe-passe, face à face, téléphones, ordi à plusieurs niveaux (comme ses autres jeux).
- Mention « Tous droits réservés » (fichier `LICENSE` + section Licence du README).
- (v1.0, abandonné en v2.0) Mode téléphones : liaison WebRTC directe, avec secours manuel.

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

### 13 novembre 2026 — v2.0 : mode « En ligne » et plateau

Décisions (avec le propriétaire) : 2 humains obligatoires en ligne, un appareil chacun ; autres places ordi ou absentes ; un seul humain n'a pas de sens en ligne (le solo existe) ; mains et dossier cachés « par confiance » ; plateau iPad en lecture seule, personne ne joue dessus ; avec plateau, le téléphone cache la table commune mais le mini-plateau reste pour choisir sa case ; solo local conservé.

1. Ajout de `en-ligne.js` (copie identique de celle des autres jeux, Supabase projet plan-du-jour, table `parties`).
2. Suppression de `js/net.js`, `js/vendor/` (PeerJS, qrcode), `tests/net.test.mjs`, et des modes passe-passe / face à face / téléphones.
3. `js/main.js` réécrit : solo (sauvegarde locale) ; en ligne (création, rejoindre par code, reprise, suppression, Rejouer, écriture optimiste, conflit = l'état distant l'emporte) ; l'hôte seul joue les ordinateurs ; plateau (lecture seule, signe de vie dans une ligne `jeu='plateau'`) et détection côté téléphone (classe « table masquée », bouton manuel).
4. `js/ui.js` : menu, réglage (rôles Moi / Invité / Ordi / Absent), écran En ligne, attente, historique public des suggestions, écran de fin (Rejouer), suppression du mode « maintenir pour voir ».
5. `engine.js` inchangé. Ancienne sauvegarde passe-passe à un seul humain reprise comme solo ; les autres anciennes sauvegardes sont écartées.
6. Tests : `npm test` (13 tests, dont 2 sur l'absence de fuite dans la vue publique) ; test navigateur `tests/e2e/en_ligne.py` (53 vérifications : 2 appareils, conflit, plateau, coupure réseau, reprise, intrus, accusation + Rejouer, suppression, solo).
7. `sw.js` : cache `em-v2`, jamais de cache des requêtes vers un autre site.

## À faire / à valider

- [ ] Activer GitHub Pages sur le dépôt (branche `main`, dossier racine) si ce n'est pas déjà fait.
- [ ] Tester le mode En ligne sur de vrais appareils (2 téléphones, puis avec l'iPad en plateau) : création, rejoindre, plateau détecté, déplacement, réfutation secrète, Rejouer.
- [ ] Vérifier avec le vrai Supabase que la table accepte `jeu='plateau'` (sinon les téléphones gardent la table affichée).
- [ ] Vérifier le ressenti du plateau sur iPad (taille des cases, lisibilité).
- [ ] Limite connue : si l'application de l'hôte est fermée, les ordinateurs ne jouent plus.
- [ ] Idées non réalisées : animation des déplacements, sons, historique détaillé des suggestions dans le carnet.

## 2026-11-14 — v2.1 : adaptation à l'iPhone 16e (390 × ~664 utiles)
1. Plateau limité à 44 % de la hauteur sur petit écran ; barre d'actions collée en bas : les boutons restent visibles sans défiler.
2. Cache du service worker `em-v3`. Tests solo/en ligne OK (53 vérifications).

## 2026-11-14 — livraison v4 : marge haute iPhone + correctif de cache
1. En-tête descendu sous la zone floutée d'iOS (iPhone, appli installée) : marge haute supplémentaire (même principe que 5 Rois v15, à valider sur l'appareil de l'auteur).
2. Cache : fichiers versionnés `?v=4` dans index.html et sw.js, installation du service worker avec `cache: 'reload'`, requêtes avec `cache: 'no-cache'`, réseau d'abord puis cache hors ligne. Version et nom du cache incrémentés ensemble.
3. Tests e2e OK.
