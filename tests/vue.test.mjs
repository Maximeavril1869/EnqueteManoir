import test from 'node:test';
import assert from 'node:assert/strict';
import { nouvellePartie, vuePour, appliquer } from '../js/engine.js';

const joueurs = [
  { id: 'corail', nom: 'A', kind: 'humain' }, { id: 'safran', nom: 'B', kind: 'humain' }, { id: 'sauge', nom: 'C', kind: 'ia' },
];

test('vue publique (plateau) : aucune main, aucune carte montrée, pas de solution', () => {
  const st = nouvellePartie({ joueurs, seed: 42 });
  const v = vuePour(st, null);
  assert.deepEqual(v.hand, []);
  assert.deepEqual(v.reveals, []);
  assert.deepEqual(v.shownByMe, []);
  assert.equal(v.solution, null);
  const json = JSON.stringify(v);
  for (const c of Object.values(st.envelope)) assert.ok(!json.includes('"' + c + '"'), 'dossier absent de la vue : ' + c);
  for (const p of st.players) for (const c of p.hand) assert.ok(!json.includes('"' + c + '"'), 'main absente de la vue : ' + c);
});

test('vue publique : le journal privé (carte montrée) n’y figure pas, même pour le destinataire absent', () => {
  const st = nouvellePartie({ joueurs, seed: 7 });
  let n = 0;
  while (n++ < 400 && !st.log.some((l) => l.to)) {
    const a = st.phase === 'refuting' ? st.pending.refuter : st.order[st.turnIdx];
    let r = { ok: false };
    if (st.phase === 'start') r = appliquer(st, { by: a, type: 'roll' });
    else if (st.phase === 'moving') {
      const salle = st.reach.rooms[0];
      r = appliquer(st, { by: a, type: 'move', dest: salle ? { room: salle } : { x: st.reach.cells[0][0], y: st.reach.cells[0][1] } });
    } else if (st.phase === 'act') {
      r = st.canSuggest ? appliquer(st, { by: a, type: 'suggest', s: 's:corail', a: 'a:poignard' }) : appliquer(st, { by: a, type: 'end' });
    } else if (st.phase === 'refuting') r = appliquer(st, { by: a, type: 'show', card: st.pending.options[0] });
    else if (st.phase === 'after') r = appliquer(st, { by: a, type: 'end' });
    assert.ok(r.ok, JSON.stringify(r));
  }
  const priv = st.log.find((l) => l.to);
  assert.ok(priv, 'une réfutation a eu lieu');
  assert.ok(!vuePour(st, null).log.some((l) => l.to));
  assert.ok(vuePour(st, priv.to).log.some((l) => l.to === priv.to));
  const autre = st.order.find((p) => p !== priv.to);
  assert.ok(!vuePour(st, autre).log.some((l) => l.to === priv.to));
});
