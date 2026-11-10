// Déduction : à partir de ce qu'un joueur a le droit de savoir (sa main, les cartes qu'on lui a montrées,
// l'historique public des suggestions), calcule qui peut détenir chaque carte.
// Sert à l'ordinateur ET à l'aide automatique du carnet.
import { CARTES } from './data.js';

const ENV = 'env';

// niveau 1 : main + cartes montrées seulement
// niveau 2 : + cartes que les autres n'ont pas pu montrer et règle du dossier
// niveau 3 : propagation complète (tailles de mains, clauses de réfutation)
export function deduire(vue, niveau = 3) {
  const moi = vue.you;
  const joueurs = vue.players.map((p) => p.id);
  const owners = [...joueurs, ENV];
  const poss = {};
  for (const c of CARTES) poss[c.id] = new Set(owners);
  const taille = Object.fromEntries(vue.players.map((p) => [p.id, p.handSize]));

  for (const c of CARTES) {
    if (vue.hand.includes(c.id)) poss[c.id] = new Set([moi]);
    else poss[c.id].delete(moi);
  }
  for (const r of vue.reveals) poss[r.card] = new Set([r.from]);

  const clauses = [];
  if (niveau >= 2) {
    for (const h of vue.history) {
      const trio = [h.s, h.a, h.p];
      for (const q of h.passed) for (const c of trio) poss[c].delete(q);
      if (h.refuter) {
        // Si la carte a été montrée à moi, c'est déjà une certitude.
        const connue = h.by === moi && vue.reveals.some((r) => r.h === h.n);
        if (!connue) clauses.push({ r: h.refuter, cartes: trio });
      }
    }
  }

  const parType = { s: [], a: [], p: [] };
  for (const c of CARTES) parType[c.type].push(c.id);

  let change = true;
  let garde = 0;
  while (change && garde++ < 60) {
    change = false;
    const retirer = (c, o) => {
      if (poss[c].has(o) && poss[c].size > 1) {
        poss[c].delete(o);
        change = true;
      }
    };
    // Une carte à un seul propriétaire possible
    for (const c of CARTES) {
      if (poss[c.id].size === 1) {
        // rien à faire de plus, la propagation passe par les compteurs ci-dessous
      }
    }
    if (niveau >= 2) {
      // Capacité des mains (niveau 3 seulement)
      if (niveau >= 3)
      for (const p of niveau >= 3 ? joueurs : []) {
        const connues = CARTES.filter((c) => poss[c.id].size === 1 && poss[c.id].has(p));
        const candidates = CARTES.filter((c) => poss[c.id].has(p));
        if (connues.length === taille[p]) {
          for (const c of candidates) if (!(poss[c.id].size === 1)) retirer(c.id, p);
        } else if (candidates.length === taille[p]) {
          for (const c of candidates) {
            if (poss[c.id].size > 1) {
              poss[c.id] = new Set([p]);
              change = true;
            }
          }
        }
      }
      // Dossier : exactement une carte de chaque type
      for (const t of ['s', 'a', 'p']) {
        const dansEnv = parType[t].filter((id) => poss[id].has(ENV));
        if (dansEnv.length === 1 && poss[dansEnv[0]].size > 1) {
          poss[dansEnv[0]] = new Set([ENV]);
          change = true;
        }
        const sure = parType[t].find((id) => poss[id].size === 1 && poss[id].has(ENV));
        if (sure) for (const id of parType[t]) if (id !== sure) retirer(id, ENV);
        // Une carte qui n'a plus que ENV comme option
        for (const id of parType[t]) {
          if (poss[id].size === 1 && !poss[id].has(ENV)) retirer(id, ENV);
        }
      }
      // Clauses de réfutation (niveau 3 seulement)
      for (const cl of niveau >= 3 ? clauses : []) {
        const ok = cl.cartes.filter((c) => poss[c].has(cl.r));
        if (ok.length === 1 && poss[ok[0]].size > 1) {
          poss[ok[0]] = new Set([cl.r]);
          change = true;
        }
      }
    }
  }
  return { poss, joueurs };
}

export function candidatsDossier(K) {
  const res = { s: [], a: [], p: [] };
  for (const c of CARTES) if (K.poss[c.id].has(ENV)) res[c.type].push(c.id);
  return res;
}

export function solutionSure(K) {
  const c = candidatsDossier(K);
  return c.s.length === 1 && c.a.length === 1 && c.p.length === 1 ? { s: c.s[0], a: c.a[0], p: c.p[0] } : null;
}

// Pour le carnet : statut déduit d'une carte pour un joueur : 'oui' | 'non' | 'env' | null
export function statutCarte(K, carte, joueurId) {
  const s = K.poss[carte];
  if (s.size === 1) {
    if (s.has(ENV)) return joueurId === ENV ? 'oui' : 'non';
    return s.has(joueurId) ? 'oui' : 'non';
  }
  if (joueurId !== ENV && !s.has(joueurId)) return 'non';
  return null;
}
export { ENV };
