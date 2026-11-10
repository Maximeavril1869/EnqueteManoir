import test from 'node:test';
import assert from 'node:assert/strict';
import { nouvellePartie, appliquer, vuePour, acteurCourant, calculerPortee } from '../js/engine.js';
import { deduire, solutionSure } from '../js/knowledge.js';
import { decider } from '../js/ai.js';
import { CARTES, SUSPECTS, PIECES, GRILLE, PORTES, W, H, PASSAGES } from '../js/data.js';

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function config(ids, niveaux) {
  return { seed: 12345, joueurs: ids.map((id, i) => ({ id, nom: id, kind: 'ia', niveau: niveaux[i % niveaux.length] })) };
}

test('plateau : portes valides, passages symétriques', () => {
  for (const d of PORTES) {
    assert.equal(GRILLE[d.out[1]][d.out[0]], 0, 'out doit être un couloir ' + d.piece);
    assert.equal(GRILLE[d.in[1]][d.in[0]], 1, 'in doit être dans une pièce ' + d.piece);
    const p = PIECES.find((x) => x.id === d.piece);
    assert.ok(d.in[0] >= p.r.x0 && d.in[0] <= p.r.x1 && d.in[1] >= p.r.y0 && d.in[1] <= p.r.y1);
    assert.equal(Math.abs(d.out[0] - d.in[0]) + Math.abs(d.out[1] - d.in[1]), 1);
  }
  for (const [a, b] of Object.entries(PASSAGES)) assert.equal(PASSAGES[b], a);
  for (const s of SUSPECTS) assert.equal(GRILLE[s.depart.y][s.depart.x], 0);
});

test('plateau : toutes les portes sont reliées entre elles', () => {
  const vu = new Set();
  const [sx, sy] = PORTES[0].out;
  const q = [[sx, sy]];
  vu.add(sy * W + sx);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || GRILLE[ny][nx] !== 0) continue;
      if (vu.has(ny * W + nx)) continue;
      vu.add(ny * W + nx);
      q.push([nx, ny]);
    }
  }
  for (const d of PORTES) assert.ok(vu.has(d.out[1] * W + d.out[0]), 'porte isolée ' + d.piece);
  for (const s of SUSPECTS) assert.ok(vu.has(s.depart.y * W + s.depart.x), 'départ isolé ' + s.id);
});

test('distribution : 18 cartes + dossier, aucune carte en double', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const st = nouvellePartie(config(SUSPECTS.slice(0, n).map((s) => s.id), [2]));
    const toutes = st.players.flatMap((p) => p.hand).concat(Object.values(st.envelope));
    assert.equal(toutes.length, 21);
    assert.equal(new Set(toutes).size, 21);
    const tailles = st.players.map((p) => p.hand.length);
    assert.ok(Math.max(...tailles) - Math.min(...tailles) <= 1);
    assert.equal(st.envelope.s[0], 's');
    assert.equal(st.envelope.a[0], 'a');
    assert.equal(st.envelope.p[0], 'p');
  }
});

test('déplacement : portée exacte, pas de passage à travers un pion, pièces atteignables', () => {
  const st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  st.dice = [3, 4];
  const r = calculerPortee(st, 'corail');
  assert.ok(r.cells.length > 0);
  for (const [x, y] of r.cells) {
    const d = Math.abs(x - 15) + Math.abs(y - 24);
    assert.ok(d <= 7 && d % 2 === 1 % 2 || d <= 7);
    assert.equal(GRILLE[y][x], 0);
  }
  // Sortie d'une pièce : on ne peut pas ré-entrer dans la même pièce
  st.pawns.corail = { room: 'hall' };
  st.dice = [6, 6];
  const r2 = calculerPortee(st, 'corail');
  assert.ok(!r2.rooms.includes('hall'));
  assert.ok(r2.rooms.length > 0);
});

test('suggestion : ordre des joueurs, réfutation, suspect et arme convoqués', () => {
  const st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  // On force une situation connue.
  st.pawns.corail = { room: 'salon' };
  st.phase = 'act';
  st.canSuggest = true;
  const [c, sa, sg] = st.players;
  const sCarte = 's:mauve', aCarte = 'a:corde', pCarte = 'p:salon';
  for (const p of st.players) p.hand = [];
  st.envelope = { s: 's:ivoire', a: 'a:poignard', p: 'p:hall' };
  sa.hand = ['a:chandelier'];
  sg.hand = [aCarte, 's:azur'];
  const r = appliquer(st, { by: 'corail', type: 'suggest', s: sCarte, a: aCarte });
  assert.ok(r.ok);
  assert.deepEqual(st.pawns.mauve, { room: 'salon' });
  assert.equal(st.weapons.corde, 'salon');
  const h = st.history.at(-1);
  assert.deepEqual(h.passed, ['safran']);
  assert.equal(h.refuter, 'sauge');
  assert.equal(st.phase, 'after');
  assert.deepEqual(st.priv.corail.reveals[0].card, aCarte);
  // Seule la suggérante voit la carte
  assert.ok(vuePour(st, 'corail').log.some((l) => l.txt.includes('vous montre')));
  assert.ok(!vuePour(st, 'safran').log.some((l) => l.txt.includes('vous montre')));
});

test('suggestion : choix de la carte à montrer quand il y en a plusieurs', () => {
  const st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  st.pawns.corail = { room: 'salon' };
  st.phase = 'act';
  st.canSuggest = true;
  for (const p of st.players) p.hand = [];
  st.players[1].hand = ['s:mauve', 'a:corde'];
  appliquer(st, { by: 'corail', type: 'suggest', s: 's:mauve', a: 'a:corde' });
  assert.equal(st.phase, 'refuting');
  assert.equal(acteurCourant(st), 'safran');
  assert.ok(!appliquer(st, { by: 'corail', type: 'show', card: 's:mauve' }).ok);
  assert.ok(!appliquer(st, { by: 'safran', type: 'show', card: 'p:hall' }).ok);
  assert.ok(appliquer(st, { by: 'safran', type: 'show', card: 'a:corde' }).ok);
  assert.equal(st.phase, 'after');
});

test('accusation : fausse = élimination, juste = victoire, dernier en lice gagne', () => {
  let st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  const e = st.envelope;
  assert.ok(appliquer(st, { by: 'corail', type: 'accuse', s: e.s, a: e.a, p: e.p }).gagne);
  assert.equal(st.winner, 'corail');
  assert.equal(st.phase, 'over');

  st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  const faux = { s: 's:corail', a: 'a:corde', p: 'p:hall' };
  if (st.envelope.s === faux.s && st.envelope.a === faux.a && st.envelope.p === faux.p) faux.p = 'p:salon';
  appliquer(st, { by: 'corail', type: 'accuse', ...faux });
  assert.ok(st.players[0].eliminated);
  assert.equal(acteurCourant(st), 'safran');
  appliquer(st, { by: 'safran', type: 'accuse', ...faux });
  assert.equal(st.phase, 'over');
  assert.equal(st.winner, 'sauge');
});

test('un joueur éliminé est sauté mais montre encore ses cartes', () => {
  const st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  st.players[1].eliminated = true;
  st.pawns.corail = { room: 'salon' };
  st.phase = 'act';
  st.canSuggest = true;
  for (const p of st.players) p.hand = [];
  st.players[1].hand = ['a:corde'];
  appliquer(st, { by: 'corail', type: 'suggest', s: 's:mauve', a: 'a:corde' });
  assert.equal(st.history.at(-1).refuter, 'safran');
  appliquer(st, { by: 'corail', type: 'end' });
  assert.equal(acteurCourant(st), 'sauge');
});

test('vue : un joueur ne voit ni le dossier ni les mains des autres', () => {
  const st = nouvellePartie(config(['corail', 'safran', 'sauge'], [2]));
  const v = JSON.stringify(vuePour(st, 'corail'));
  assert.ok(!v.includes('envelope'));
  for (const c of st.players[1].hand) assert.ok(!vuePour(st, 'corail').hand.includes(c));
  assert.equal(vuePour(st, 'corail').solution, null);
});

function jouerPartie(ids, niveaux, seed, verifierDeduction = true) {
  const st = nouvellePartie({ seed, joueurs: ids.map((id, i) => ({ id, nom: id, kind: 'ia', niveau: niveaux[i % niveaux.length] })) });
  const rng = prng(seed + 7);
  let actions = 0;
  const proprio = {};
  for (const p of st.players) for (const c of p.hand) proprio[c] = p.id;
  for (const k of ['s', 'a', 'p']) proprio[st.envelope[k]] = 'env';
  while (st.phase !== 'over') {
    const qui = acteurCourant(st);
    const vue = vuePour(st, qui);
    const act = decider(vue, rng);
    assert.ok(act, 'IA sans décision en phase ' + st.phase);
    const r = appliquer(st, act);
    assert.ok(r.ok, `Action refusée (${JSON.stringify(act)}) : ${r.err}`);
    if (++actions > 20000) assert.fail('partie interminable');
    if (verifierDeduction && actions % 7 === 0) {
      for (const p of st.players) {
        const K = deduire(vuePour(st, p.id), 3);
        for (const c of CARTES) assert.ok(K.poss[c.id].has(proprio[c.id]), `déduction fausse pour ${c.id} (${p.id}) : possible=${[...K.poss[c.id]]} réel=${proprio[c.id]}`);
      }
    }
  }
  return st;
}

test('simulation : parties 100 % ordinateur terminent et les déductions restent exactes', () => {
  const ids6 = SUSPECTS.map((s) => s.id);
  for (let seed = 1; seed <= 12; seed++) {
    const n = 2 + (seed % 5);
    const st = jouerPartie(ids6.slice(0, n), [1, 2, 3], seed * 101);
    assert.ok(st.winner);
    assert.deepEqual(st.solution, st.envelope);
  }
});

test('simulation : l’IA experte finit en un nombre raisonnable de tours', () => {
  const ids = ['corail', 'safran', 'sauge', 'ivoire'];
  let total = 0;
  const N = 10;
  for (let i = 0; i < N; i++) {
    const st = jouerPartie(ids, [3], 500 + i, false);
    total += st.turnCount / ids.length;
  }
  console.log('Tours moyens par joueur (experts, 4 joueurs) :', (total / N).toFixed(1));
  assert.ok(total / N < 70);
});
