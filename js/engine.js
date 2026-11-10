// Moteur de règles : état sérialisable, aucune dépendance au navigateur.
import {
  SUSPECTS, ARMES, PIECES, CARTES, CARTE_PAR_ID, GRILLE, W, H, PASSAGES,
  PORTE_PAR_CASE, PORTES_PAR_PIECE, SUSPECT_PAR_ID, PIECE_PAR_ID, nomCarte,
} from './data.js';

// ---------- Aléatoire déterministe (état stocké dans la partie) ----------
export function rnd(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function entier(state, n) {
  return Math.floor(rnd(state) * n);
}
function melanger(state, tab) {
  const a = tab.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = entier(state, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Création ----------
// config.joueurs : [{ id (id de suspect), nom, kind: 'humain'|'ia', niveau: 1..3 }]
export function nouvellePartie(config) {
  const seed = config.seed ?? (Math.random() * 4294967296) >>> 0;
  const state = {
    v: 1,
    gameId: 'g' + seed.toString(36) + Date.now().toString(36).slice(-4),
    rng: seed >>> 0,
    players: [],
    order: [],
    envelope: null,
    pawns: {},
    weapons: {},
    turnIdx: 0,
    turnCount: 1,
    phase: 'start',
    dice: null,
    reach: null,
    canSuggest: false,
    pending: null,
    history: [],
    priv: {},
    log: [],
    winner: null,
    solution: null,
  };
  const presents = new Set(config.joueurs.map((j) => j.id));
  for (const s of SUSPECTS) {
    if (!presents.has(s.id)) continue;
    const j = config.joueurs.find((x) => x.id === s.id);
    state.players.push({
      id: s.id,
      nom: j.nom || s.court,
      kind: j.kind || 'ia',
      niveau: j.niveau || 2,
      hand: [],
      eliminated: false,
      moved: false,
    });
    state.order.push(s.id);
    state.priv[s.id] = { reveals: [], shown: [] };
  }
  // Dossier confidentiel
  const s = SUSPECTS[entier(state, SUSPECTS.length)];
  const a = ARMES[entier(state, ARMES.length)];
  const p = PIECES[entier(state, PIECES.length)];
  state.envelope = { s: 's:' + s.id, a: 'a:' + a.id, p: 'p:' + p.id };
  const env = new Set(Object.values(state.envelope));
  const reste = melanger(state, CARTES.map((c) => c.id).filter((id) => !env.has(id)));
  reste.forEach((id, i) => state.players[i % state.players.length].hand.push(id));
  for (const pl of state.players) pl.hand.sort((x, y) => CARTES.findIndex((c) => c.id === x) - CARTES.findIndex((c) => c.id === y));
  for (const su of SUSPECTS) state.pawns[su.id] = { x: su.depart.x, y: su.depart.y };
  const salles = melanger(state, PIECES.map((x) => x.id));
  ARMES.forEach((arme, i) => (state.weapons[arme.id] = salles[i]));
  log(state, `La partie commence. ${joueur(state, state.order[0]).nom} joue en premier.`);
  return state;
}

// ---------- Utilitaires ----------
export function joueur(state, id) {
  return state.players.find((p) => p.id === id);
}
export function acteurCourant(state) {
  if (state.phase === 'over') return null;
  if (state.phase === 'refuting') return state.pending.refuter;
  return state.order[state.turnIdx];
}
function log(state, txt, to) {
  state.log.push(to ? { txt, to } : { txt });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}
function nomJ(state, id) {
  const p = joueur(state, id);
  return p ? p.nom : id;
}
export function positionPion(state, id) {
  return state.pawns[id];
}

// ---------- Déplacements ----------
const VOIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function calculerPortee(state, pid) {
  const pawn = state.pawns[pid];
  const total = state.dice[0] + state.dice[1];
  const occupe = new Set();
  for (const [sid, p] of Object.entries(state.pawns)) {
    if (sid !== pid && p.x !== undefined) occupe.add(p.y * W + p.x);
  }
  const cells = new Set();
  const rooms = new Set();
  const depart = pawn.room || null;
  const visite = new Uint8Array(W * H);

  function dfs(x, y, reste) {
    if (reste === 0) {
      cells.add(y * W + x);
      return;
    }
    const porte = PORTE_PAR_CASE[y * W + x];
    if (porte && porte !== depart) rooms.add(porte);
    for (const [dx, dy] of VOIS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (GRILLE[ny][nx] !== 0) continue;
      const i = ny * W + nx;
      if (visite[i] || occupe.has(i)) continue;
      visite[i] = 1;
      dfs(nx, ny, reste - 1);
      visite[i] = 0;
    }
  }

  if (depart) {
    for (const d of PORTES_PAR_PIECE[depart]) {
      const i = d.out[1] * W + d.out[0];
      if (occupe.has(i)) continue;
      visite[i] = 1;
      dfs(d.out[0], d.out[1], total - 1);
      visite[i] = 0;
    }
  } else {
    visite[pawn.y * W + pawn.x] = 1;
    dfs(pawn.x, pawn.y, total);
  }
  return {
    cells: [...cells].map((i) => [i % W, (i / W) | 0]),
    rooms: [...rooms],
  };
}

// ---------- Actions ----------
function suivant(state) {
  const n = state.order.length;
  let i = state.turnIdx;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (!joueur(state, state.order[i]).eliminated) break;
  }
  state.turnIdx = i;
  state.turnCount++;
  state.phase = 'start';
  state.dice = null;
  state.reach = null;
  state.canSuggest = false;
  state.pending = null;
  log(state, `— Au tour de ${nomJ(state, state.order[i])} —`);
}

function enSalle(state, pid) {
  return state.pawns[pid].room || null;
}

export function peutPassage(state, pid) {
  const r = enSalle(state, pid);
  return !!(r && PASSAGES[r]);
}

function reveler(state, refuter, suggester, carte, h) {
  state.priv[suggester].reveals.push({ card: carte, from: refuter, h });
  state.priv[refuter].shown.push({ to: suggester, card: carte });
  log(state, `${nomJ(state, refuter)} montre une carte à ${nomJ(state, suggester)}.`);
  log(state, `${nomJ(state, refuter)} vous montre : ${nomCarte(carte)}.`, suggester);
  state.pending = null;
  state.phase = 'after';
}

export function appliquer(state, action) {
  const acteur = acteurCourant(state);
  if (!acteur) return { ok: false, err: 'Partie terminée.' };
  if (action.by !== acteur) return { ok: false, err: "Ce n'est pas à toi de jouer." };
  const pid = action.by;
  const me = joueur(state, pid);

  switch (action.type) {
    case 'roll': {
      if (state.phase !== 'start') return { ok: false, err: 'Action impossible.' };
      me.moved = false;
      state.dice = [1 + entier(state, 6), 1 + entier(state, 6)];
      const total = state.dice[0] + state.dice[1];
      state.reach = calculerPortee(state, pid);
      log(state, `${me.nom} lance les dés : ${state.dice[0]} + ${state.dice[1]} = ${total}.`);
      if (!state.reach.cells.length && !state.reach.rooms.length) {
        log(state, `${me.nom} est bloqué et ne peut pas avancer.`);
        state.phase = 'act';
        state.canSuggest = false;
      } else {
        state.phase = 'moving';
      }
      return { ok: true };
    }
    case 'passage': {
      if (state.phase !== 'start' || !peutPassage(state, pid)) return { ok: false, err: 'Pas de passage ici.' };
      const dest = PASSAGES[enSalle(state, pid)];
      state.pawns[pid] = { room: dest };
      me.moved = false;
      log(state, `${me.nom} emprunte le passage secret jusqu'à : ${PIECE_PAR_ID[dest].nom}.`);
      state.phase = 'act';
      state.canSuggest = true;
      return { ok: true };
    }
    case 'stay': {
      if (state.phase !== 'start' || !enSalle(state, pid) || !me.moved) return { ok: false, err: 'Action impossible.' };
      me.moved = false;
      log(state, `${me.nom} reste dans la pièce : ${PIECE_PAR_ID[enSalle(state, pid)].nom}.`);
      state.phase = 'act';
      state.canSuggest = true;
      return { ok: true };
    }
    case 'move': {
      if (state.phase !== 'moving') return { ok: false, err: 'Action impossible.' };
      const d = action.dest;
      if (d.room) {
        if (!state.reach.rooms.includes(d.room)) return { ok: false, err: 'Pièce hors de portée.' };
        state.pawns[pid] = { room: d.room };
        log(state, `${me.nom} entre dans : ${PIECE_PAR_ID[d.room].nom}.`);
        state.canSuggest = true;
      } else {
        if (!state.reach.cells.some(([x, y]) => x === d.x && y === d.y)) return { ok: false, err: 'Case hors de portée.' };
        state.pawns[pid] = { x: d.x, y: d.y };
        log(state, `${me.nom} se déplace dans le couloir.`);
        state.canSuggest = false;
      }
      state.phase = 'act';
      state.reach = null;
      return { ok: true };
    }
    case 'suggest': {
      if (state.phase !== 'act' || !state.canSuggest) return { ok: false, err: 'Suggestion impossible.' };
      const salle = enSalle(state, pid);
      const s = action.s;
      const a = action.a;
      if (!CARTE_PAR_ID[s] || CARTE_PAR_ID[s].type !== 's') return { ok: false, err: 'Suspect invalide.' };
      if (!CARTE_PAR_ID[a] || CARTE_PAR_ID[a].type !== 'a') return { ok: false, err: 'Arme invalide.' };
      const p = 'p:' + salle;
      // Le suspect et l'arme sont convoqués dans la pièce.
      const sid = CARTE_PAR_ID[s].ref;
      state.pawns[sid] = { room: salle };
      const sj = joueur(state, sid);
      if (sj && sid !== pid) sj.moved = true;
      state.weapons[CARTE_PAR_ID[a].ref] = salle;
      state.canSuggest = false;
      log(state, `${me.nom} suggère : ${nomCarte(s)}, avec ${nomCarte(a)}, dans ${nomCarte(p)}.`);
      const entree = { n: state.history.length, by: pid, s, a, p, passed: [], refuter: null };
      state.history.push(entree);
      const n = state.order.length;
      const i0 = state.order.indexOf(pid);
      for (let k = 1; k < n; k++) {
        const qid = state.order[(i0 + k) % n];
        const q = joueur(state, qid);
        const opts = q.hand.filter((c) => c === s || c === a || c === p);
        if (!opts.length) {
          entree.passed.push(qid);
          log(state, `${q.nom} ne peut rien montrer.`);
          continue;
        }
        entree.refuter = qid;
        if (opts.length === 1) {
          reveler(state, qid, pid, opts[0], entree.n);
        } else {
          state.phase = 'refuting';
          state.pending = { refuter: qid, suggester: pid, options: opts, h: entree.n };
          log(state, `${q.nom} doit choisir la carte à montrer.`);
        }
        return { ok: true };
      }
      log(state, 'Personne ne peut réfuter cette suggestion.');
      state.phase = 'after';
      return { ok: true };
    }
    case 'show': {
      if (state.phase !== 'refuting') return { ok: false, err: 'Action impossible.' };
      const pe = state.pending;
      if (!pe.options.includes(action.card)) return { ok: false, err: 'Carte invalide.' };
      reveler(state, pe.refuter, pe.suggester, action.card, pe.h);
      return { ok: true };
    }
    case 'accuse': {
      if (!['start', 'act', 'after'].includes(state.phase)) return { ok: false, err: 'Action impossible.' };
      const { s, a, p } = action;
      if (!CARTE_PAR_ID[s] || CARTE_PAR_ID[s].type !== 's' || !CARTE_PAR_ID[a] || CARTE_PAR_ID[a].type !== 'a' || !CARTE_PAR_ID[p] || CARTE_PAR_ID[p].type !== 'p') {
        return { ok: false, err: 'Accusation invalide.' };
      }
      log(state, `${me.nom} accuse : ${nomCarte(s)}, avec ${nomCarte(a)}, dans ${nomCarte(p)} !`);
      const e = state.envelope;
      if (e.s === s && e.a === a && e.p === p) {
        state.winner = pid;
        state.solution = { ...e };
        state.phase = 'over';
        state.pending = null;
        log(state, `Accusation exacte ! ${me.nom} remporte la partie.`);
        return { ok: true, gagne: true };
      }
      me.eliminated = true;
      log(state, `Accusation fausse : ${me.nom} est éliminé (il continue de montrer ses cartes).`);
      const vivants = state.players.filter((q) => !q.eliminated);
      if (vivants.length === 1) {
        state.winner = vivants[0].id;
        state.solution = { ...e };
        state.phase = 'over';
        log(state, `${vivants[0].nom} est le dernier détective en lice : il remporte la partie.`);
        return { ok: true, gagne: false };
      }
      suivant(state);
      return { ok: true, gagne: false };
    }
    case 'end': {
      if (!['act', 'after'].includes(state.phase)) return { ok: false, err: 'Action impossible.' };
      suivant(state);
      return { ok: true };
    }
    default:
      return { ok: false, err: 'Action inconnue.' };
  }
}

// ---------- Vues (ce que chaque joueur a le droit de voir) ----------
export function vuePour(state, pid) {
  const acteur = acteurCourant(state);
  const moi = pid ? joueur(state, pid) : null;
  const sonTour = !!pid && acteur === pid;
  const v = {
    gameId: state.gameId,
    you: pid || null,
    players: state.players.map((p) => ({
      id: p.id, nom: p.nom, kind: p.kind, niveau: p.niveau, eliminated: p.eliminated,
      handSize: p.hand.length, moved: p.moved,
    })),
    order: state.order,
    turnPid: state.order[state.turnIdx],
    turnCount: state.turnCount,
    actor: acteur,
    phase: state.phase,
    dice: state.dice,
    reach: state.reach,
    canSuggest: state.canSuggest,
    pawns: state.pawns,
    weapons: state.weapons,
    history: state.history,
    log: state.log.filter((l) => !l.to || l.to === pid).slice(-120),
    hand: moi ? moi.hand : [],
    reveals: moi ? state.priv[pid].reveals : [],
    shownByMe: moi ? state.priv[pid].shown : [],
    winner: state.winner,
    solution: state.solution,
    pending: state.pending ? { refuter: state.pending.refuter, suggester: state.pending.suggester } : null,
    can: {},
  };
  if (sonTour) {
    const ph = state.phase;
    v.can = {
      roll: ph === 'start',
      passage: ph === 'start' && peutPassage(state, pid),
      stay: ph === 'start' && !!enSalle(state, pid) && moi.moved,
      move: ph === 'moving',
      suggest: ph === 'act' && state.canSuggest,
      accuse: ['start', 'act', 'after'].includes(ph),
      end: ph === 'act' || ph === 'after',
      show: ph === 'refuting',
    };
    if (ph === 'refuting') v.showOptions = state.pending.options;
    if (peutPassage(state, pid)) v.passageVers = PASSAGES[enSalle(state, pid)];
  }
  return v;
}

export function description(state) {
  return state.players.map((p) => `${p.nom}(${p.kind})`).join(', ');
}
export { SUSPECT_PAR_ID };
