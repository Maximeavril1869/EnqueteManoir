import test from 'node:test';
import assert from 'node:assert/strict';
import { SalonHote, ClientTel } from '../js/net.js';
import { nouvellePartie, vuePour, appliquer, acteurCourant } from '../js/engine.js';

// Paire de connexions factices en mémoire (même interface que les adaptateurs WebRTC).
function paire() {
  const mk = () => ({ onmessage: null, onclose: null, autre: null,
    send(o) { const m = JSON.parse(JSON.stringify(o)); queueMicrotask(() => this.autre.onmessage && this.autre.onmessage(m)); },
    close() { queueMicrotask(() => { this.onclose && this.onclose(); this.autre.onclose && this.autre.onclose(); }); } });
  const a = mk(), b = mk();
  a.autre = b; b.autre = a;
  return [a, b];
}
const tick = () => new Promise((r) => setTimeout(r, 5));

function monter() {
  const seats = [{ id: 'corail', nom: 'Corail', couleur: '#d9362b' }, { id: 'safran', nom: 'Safran', couleur: '#e3b505' }];
  const recu = { actions: [], changes: 0 };
  const hote = new SalonHote(seats, { change: () => recu.changes++, action: (a) => recu.actions.push(a), erreur: () => {} });
  const clients = {};
  const etat = {};
  const brancher = (nom) => {
    const [cote_hote, cote_client] = paire();
    etat[nom] = { vues: [], salons: [], erreurs: [], claimed: null };
    const c = new ClientTel({
      salon: (s) => etat[nom].salons.push(s), claimed: (p) => (etat[nom].claimed = p),
      vue: (v) => etat[nom].vues.push(v), erreur: (m) => etat[nom].erreurs.push(m), coupe: () => (etat[nom].coupe = true),
    });
    c.attacher(cote_client);
    hote.attacher(cote_hote);
    clients[nom] = { c, cote_hote, cote_client };
    return c;
  };
  return { hote, brancher, clients, recu, etat };
}

test('salon : chaque téléphone prend une place, doublons refusés, prêt quand tout est pris', async () => {
  const { hote, brancher, etat } = monter();
  const a = brancher('a'), b = brancher('b');
  await tick();
  assert.equal(etat.a.salons[0].length, 2);
  a.choisir('corail'); await tick();
  assert.equal(etat.a.claimed, 'corail');
  assert.equal(hote.pret(), false);
  b.choisir('corail'); await tick();
  assert.match(etat.b.erreurs[0], /déjà prise/);
  b.choisir('safran'); await tick();
  assert.equal(hote.pret(), true);
  // les autres téléphones voient les places se remplir
  assert.equal(etat.b.salons.at(-1).find((s) => s.id === 'corail').etat, 'pris');
});

test('partie : chaque téléphone ne reçoit que sa vue ; l’identité est imposée par l’hôte', async () => {
  const { hote, brancher, etat, recu } = monter();
  const a = brancher('a'), b = brancher('b');
  a.choisir('corail'); b.choisir('safran'); await tick();
  const st = nouvellePartie({ seed: 9, joueurs: [{ id: 'corail', kind: 'humain' }, { id: 'safran', kind: 'humain' }, { id: 'sauge', kind: 'ia', niveau: 2 }] });
  hote.lancer((pid) => vuePour(st, pid));
  await tick();
  const va = etat.a.vues.at(-1), vb = etat.b.vues.at(-1);
  assert.equal(va.you, 'corail');
  assert.equal(vb.you, 'safran');
  for (const c of st.players.find((p) => p.id === 'safran').hand) assert.ok(!JSON.stringify(va).includes(`"${c}"`) || va.hand.includes(c) === false);
  assert.ok(!('envelope' in va));
  assert.deepEqual(va.hand, st.players.find((p) => p.id === 'corail').hand);
  // Safran tente de jouer à la place de Corail : l'hôte force by = safran
  b.agir({ by: 'corail', type: 'roll' }); await tick();
  assert.equal(recu.actions.at(-1).by, 'safran');
  const r = appliquer(st, recu.actions.at(-1));
  assert.equal(r.ok, false);
  a.agir({ type: 'roll' }); await tick();
  assert.equal(recu.actions.at(-1).by, 'corail');
  assert.ok(appliquer(st, recu.actions.at(-1)).ok);
  hote.envoyerVues(); await tick();
  assert.ok(etat.b.vues.at(-1).dice);
});

test('déconnexion puis reprise de la même place', async () => {
  const { hote, brancher, etat, clients } = monter();
  const a = brancher('a');
  a.choisir('corail'); await tick();
  const st = nouvellePartie({ seed: 3, joueurs: [{ id: 'corail', kind: 'humain' }, { id: 'safran', kind: 'ia' }] });
  hote.lancer((pid) => vuePour(st, pid));
  await tick();
  clients.a.cote_client.close(); await tick();
  assert.equal(hote.etat.corail, 'coupe');
  // Nouveau téléphone (ou reconnexion) reprend la place et reçoit tout de suite la vue
  const a2 = brancher('a2');
  await tick();
  a2.choisir('corail'); await tick();
  assert.equal(hote.etat.corail, 'pris');
  assert.equal(etat.a2.vues.at(-1).you, 'corail');
});

test('invitation manuelle : encodage de texte aller-retour', async () => {
  const objet = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n é à' };
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(objet))));
  const dec = JSON.parse(decodeURIComponent(escape(atob(enc))));
  assert.deepEqual(dec, objet);
});
