// Joueurs ordinateur. L'IA ne lit JAMAIS l'état complet : seulement la vue de son joueur.
import { CARTES, CARTE_PAR_ID, PASSAGES, distancesVersPiece, W } from './data.js';
import { deduire, candidatsDossier, solutionSure, ENV } from './knowledge.js';

function choisir(tab, rng) {
  return tab[Math.floor(rng() * tab.length)];
}

export function decider(vue, rng = Math.random) {
  const moi = vue.you;
  const niveau = vue.players.find((p) => p.id === moi).niveau || 2;
  const K = deduire(vue, niveau);
  const cand = candidatsDossier(K);
  const sure = solutionSure(K);
  const nbTours = vue.turnCount / vue.order.length;
  const forcer = nbTours > 70;
  const accuser = () => {
    const s = sure || { s: choisir(cand.s, rng), a: choisir(cand.a, rng), p: choisir(cand.p, rng) };
    return { by: moi, type: 'accuse', s: s.s, a: s.a, p: s.p };
  };

  switch (vue.phase) {
    case 'refuting': {
      const opts = vue.showOptions;
      const deja = opts.find((c) => vue.shownByMe.some((x) => x.card === c));
      if (deja) return { by: moi, type: 'show', card: deja };
      return { by: moi, type: 'show', card: choisir(opts, rng) };
    }
    case 'start': {
      if (sure || forcer) return accuser();
      const pion = vue.pawns[moi];
      const enSalle = pion.room;
      if (enSalle && vue.can.passage) {
        const vers = PASSAGES[enSalle];
        const interessante = cand.p.includes('p:' + vers);
        const actuelleUtile = cand.p.includes('p:' + enSalle);
        if (interessante && !actuelleUtile) return { by: moi, type: 'passage' };
      }
      if (enSalle && vue.can.stay) {
        const utile = cand.p.includes('p:' + enSalle);
        if (utile || (niveau >= 2 && rng() < 0.4)) return { by: moi, type: 'stay' };
      }
      return { by: moi, type: 'roll' };
    }
    case 'moving': {
      const { cells, rooms } = vue.reach;
      const pieces = cand.p.map((c) => c.slice(2));
      const pref = pieces.length ? pieces : CARTES.filter((c) => c.type === 'p').map((c) => c.ref);
      const atteignablesPref = rooms.filter((r) => pref.includes(r));
      if (atteignablesPref.length) {
        let choix = atteignablesPref;
        if (niveau === 3) {
          const min = Math.min(...choix.map((r) => K.poss['p:' + r].size));
          choix = choix.filter((r) => K.poss['p:' + r].size === min);
        }
        return { by: moi, type: 'move', dest: { room: choisir(choix, rng) } };
      }
      if (cells.length) {
        // Se rapprocher de la pièce utile la plus proche
        const ds = pref.map((r) => distancesVersPiece(r));
        let meilleur = [];
        let dMin = Infinity;
        for (const [x, y] of cells) {
          const d = Math.min(...ds.map((t) => (t[y * W + x] < 0 ? 999 : t[y * W + x])));
          if (d < dMin) {
            dMin = d;
            meilleur = [[x, y]];
          } else if (d === dMin) meilleur.push([x, y]);
        }
        const [x, y] = choisir(meilleur, rng);
        return { by: moi, type: 'move', dest: { x, y } };
      }
      return { by: moi, type: 'move', dest: { room: choisir(rooms, rng) } };
    }
    case 'act': {
      if (sure || forcer) return accuser();
      if (vue.can.suggest) {
        const choix = suggestion(vue, K, cand, niveau, rng);
        return { by: moi, type: 'suggest', s: choix.s, a: choix.a };
      }
      return { by: moi, type: 'end' };
    }
    case 'after': {
      if (sure || forcer) return accuser();
      return { by: moi, type: 'end' };
    }
    default:
      return null;
  }
}

function suggestion(vue, K, cand, niveau, rng) {
  const main = new Set(vue.hand);
  const pick = (liste) => {
    if (niveau === 1) return choisir(liste, rng);
    const inconnues = liste.filter((c) => !main.has(c));
    const base = inconnues.length ? inconnues : liste;
    if (niveau === 2) return choisir(base, rng);
    // Niveau 3 : la carte la plus « presque résolue » (peu de propriétaires possibles) pour boucler plus vite
    let best = [];
    let score = Infinity;
    for (const c of base) {
      const sc = K.poss[c].size;
      if (sc < score) {
        score = sc;
        best = [c];
      } else if (sc === score) best.push(c);
    }
    return choisir(best, rng);
  };
  const toutS = CARTES.filter((c) => c.type === 's').map((c) => c.id);
  const toutA = CARTES.filter((c) => c.type === 'a').map((c) => c.id);
  const s = pick(cand.s.length ? cand.s : toutS);
  const a = pick(cand.a.length ? cand.a : toutA);
  return { s, a };
}

export { CARTE_PAR_ID };
