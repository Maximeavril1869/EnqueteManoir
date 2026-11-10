// Données statiques du jeu : personnages, armes, pièces, plateau.
// Les personnages sont des créations originales (couleurs des pions classiques, noms inventés).

export const SUSPECTS = [
  { id: 'corail', lettre: 'C', nom: 'Mademoiselle Corail', court: 'Corail', couleur: '#d9362b', depart: { x: 15, y: 24 } },
  { id: 'safran', lettre: 'S', nom: 'Colonel Safran', court: 'Safran', couleur: '#e3b505', depart: { x: 0, y: 7 } },
  { id: 'sauge', lettre: 'D', nom: 'Docteur Sauge', court: 'Sauge', couleur: '#2e8b57', depart: { x: 7, y: 0 } },
  { id: 'ivoire', lettre: 'I', nom: 'Madame Ivoire', court: 'Ivoire', couleur: '#f1ece0', depart: { x: 16, y: 0 } },
  { id: 'azur', lettre: 'A', nom: 'Madame Azur', court: 'Azur', couleur: '#2f6fd0', depart: { x: 23, y: 6 } },
  { id: 'mauve', lettre: 'P', nom: 'Professeur Mauve', court: 'Mauve', couleur: '#7b3fa0', depart: { x: 23, y: 19 } },
];

export const ARMES = [
  { id: 'chandelier', nom: 'Chandelier', icone: '🕯️' },
  { id: 'poignard', nom: 'Poignard', icone: '🗡️' },
  { id: 'tuyau', nom: 'Tuyau de plomb', icone: '🚰' },
  { id: 'revolver', nom: 'Revolver', icone: '🔫' },
  { id: 'corde', nom: 'Corde', icone: '🪢' },
  { id: 'cle', nom: 'Clé anglaise', icone: '🔧' },
];

// Rectangles des pièces (x0,y0 → x1,y1 inclus) sur une grille de 24 colonnes × 25 lignes.
export const PIECES = [
  { id: 'cuisine', nom: 'Cuisine', couleur: '#c9b79c', r: { x0: 0, y0: 0, x1: 5, y1: 5 } },
  { id: 'salle_de_bal', nom: 'Salle de bal', couleur: '#d8c5a3', r: { x0: 8, y0: 0, x1: 15, y1: 6 } },
  { id: 'veranda', nom: 'Véranda', couleur: '#b9cfa8', r: { x0: 18, y0: 0, x1: 23, y1: 4 } },
  { id: 'salle_a_manger', nom: 'Salle à manger', couleur: '#cfae9a', r: { x0: 0, y0: 9, x1: 6, y1: 14 } },
  { id: 'billard', nom: 'Salle de billard', couleur: '#9fbfae', r: { x0: 18, y0: 8, x1: 23, y1: 12 } },
  { id: 'bibliotheque', nom: 'Bibliothèque', couleur: '#c2a98a', r: { x0: 17, y0: 14, x1: 23, y1: 18 } },
  { id: 'salon', nom: 'Salon', couleur: '#d2a9a9', r: { x0: 0, y0: 19, x1: 6, y1: 24 } },
  { id: 'hall', nom: 'Hall', couleur: '#cdbd95', r: { x0: 9, y0: 18, x1: 14, y1: 24 } },
  { id: 'bureau', nom: 'Bureau', couleur: '#b7b0c9', r: { x0: 17, y0: 21, x1: 23, y1: 24 } },
];

export const CENTRE = { x0: 9, y0: 8, x1: 14, y1: 14 };

// Portes : case de couloir « out » devant la porte, et case de pièce « in » derrière.
export const PORTES = [
  { piece: 'cuisine', out: [4, 6], in: [4, 5] },
  { piece: 'salle_de_bal', out: [9, 7], in: [9, 6] },
  { piece: 'salle_de_bal', out: [14, 7], in: [14, 6] },
  { piece: 'salle_de_bal', out: [7, 3], in: [8, 3] },
  { piece: 'salle_de_bal', out: [16, 3], in: [15, 3] },
  { piece: 'veranda', out: [19, 5], in: [19, 4] },
  { piece: 'salle_a_manger', out: [4, 8], in: [4, 9] },
  { piece: 'salle_a_manger', out: [7, 11], in: [6, 11] },
  { piece: 'billard', out: [17, 10], in: [18, 10] },
  { piece: 'billard', out: [21, 13], in: [21, 12] },
  { piece: 'bibliotheque', out: [19, 13], in: [19, 14] },
  { piece: 'bibliotheque', out: [16, 16], in: [17, 16] },
  { piece: 'salon', out: [5, 18], in: [5, 19] },
  { piece: 'hall', out: [11, 17], in: [11, 18] },
  { piece: 'hall', out: [12, 17], in: [12, 18] },
  { piece: 'hall', out: [8, 21], in: [9, 21] },
  { piece: 'bureau', out: [19, 20], in: [19, 21] },
];

// Passages secrets (pièces d'angle opposées).
export const PASSAGES = {
  cuisine: 'bureau',
  bureau: 'cuisine',
  veranda: 'salon',
  salon: 'veranda',
};

export const W = 24;
export const H = 25;

// Grille : 0 = couloir, 1 = pièce, 2 = vide (centre).
export const GRILLE = (() => {
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(0));
  for (let y = CENTRE.y0; y <= CENTRE.y1; y++) for (let x = CENTRE.x0; x <= CENTRE.x1; x++) g[y][x] = 2;
  for (const p of PIECES) for (let y = p.r.y0; y <= p.r.y1; y++) for (let x = p.r.x0; x <= p.r.x1; x++) g[y][x] = 1;
  return g;
})();

// Case de couloir -> pièce dont c'est la porte.
export const PORTE_PAR_CASE = (() => {
  const m = {};
  for (const d of PORTES) m[d.out[1] * W + d.out[0]] = d.piece;
  return m;
})();

export const PORTES_PAR_PIECE = (() => {
  const m = {};
  for (const d of PORTES) (m[d.piece] ||= []).push(d);
  return m;
})();

// Cartes : 6 suspects, 6 armes, 9 pièces.
export const CARTES = [
  ...SUSPECTS.map((s) => ({ id: 's:' + s.id, type: 's', nom: s.nom, court: s.court, ref: s.id })),
  ...ARMES.map((a) => ({ id: 'a:' + a.id, type: 'a', nom: a.nom, court: a.nom, ref: a.id, icone: a.icone })),
  ...PIECES.map((p) => ({ id: 'p:' + p.id, type: 'p', nom: p.nom, court: p.nom, ref: p.id })),
];
export const CARTE_PAR_ID = Object.fromEntries(CARTES.map((c) => [c.id, c]));
export const TYPES = [
  { t: 's', nom: 'Suspects' },
  { t: 'a', nom: 'Armes' },
  { t: 'p', nom: 'Pièces' },
];

export const SUSPECT_PAR_ID = Object.fromEntries(SUSPECTS.map((s) => [s.id, s]));
export const ARME_PAR_ID = Object.fromEntries(ARMES.map((a) => [a.id, a]));
export const PIECE_PAR_ID = Object.fromEntries(PIECES.map((p) => [p.id, p]));

export function nomCarte(id) {
  return CARTE_PAR_ID[id] ? CARTE_PAR_ID[id].nom : id;
}

// Distances statiques (sans pions) depuis la porte de chaque pièce, pour l'ordi.
let _dist = null;
export function distancesVersPiece(pieceId) {
  if (!_dist) _dist = {};
  if (_dist[pieceId]) return _dist[pieceId];
  const d = new Int16Array(W * H).fill(-1);
  const q = [];
  for (const p of PORTES_PAR_PIECE[pieceId]) {
    const i = p.out[1] * W + p.out[0];
    d[i] = 0;
    q.push(i);
  }
  while (q.length) {
    const i = q.shift();
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (GRILLE[ny][nx] !== 0) continue;
      const j = ny * W + nx;
      if (d[j] !== -1) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  _dist[pieceId] = d;
  return d;
}
