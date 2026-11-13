// Chef d'orchestre : écrans, partie solo (1 humain + ordis) et mode « En ligne » (2 humains, un appareil chacun).
// L'état complet de la partie est dans la ligne Supabase (jeu « enquetemanoir ») ; chaque écran n'affiche que SA vue
// (engine.vuePour) : mains et dossier cachés « par confiance ». Un plateau (iPad) peut afficher la table commune en lecture seule.
import * as E from './engine.js';
import { decider } from './ai.js';
import * as UI from './ui.js';
import { SUSPECTS, PIECE_PAR_ID } from './data.js';

const EL = window.EnLigne;
const JEU = 'enquetemanoir';
const $app = document.getElementById('app');
const SAVE_KEY = 'em-save-v1';
const MAP_KEY = 'em-online-map-v1';

const App = {
  screen: 'menu', // menu | setup | online | game | plateau
  cfg: defautCfg('solo'),
  mode: null, // solo | online
  state: null,
  modal: null, // { kind, pid }
  sel: {},
  aide: lire('em-aide') === '1',
  finVue: false,
  ol: { msg: '', list: null },
  off: false, // réseau coupé (en ligne / plateau)
};
let ONL = null; // partie en ligne : { id, me, version, dirty, pushing, status, watch, retry, plat }
let PL = null; // plateau : { id, version, watch, rowId, rowVer, timer, t2, busy }

function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage refusé */ } }

function defautCfg(mode) {
  const roles = {};
  for (const s of SUSPECTS) roles[s.id] = { role: 'absent', nom: s.court, niveau: 2 };
  roles.corail.role = 'moi';
  roles.safran.role = mode === 'online' ? 'invite' : 'ia';
  roles.sauge.role = 'ia';
  return { mode, roles };
}

// ---------- Aides ----------
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}

function soloPid() {
  const p = App.state && App.state.players.find((q) => q.kind === 'humain');
  return p ? p.id : null;
}
// Le joueur de CET appareil.
function curPid() {
  if (!App.state) return null;
  if (App.mode === 'online') return ONL ? App.state.online.seats[ONL.me] : null;
  return soloPid();
}
function curView() { return E.vuePour(App.state, curPid()); }
function isHost() { return App.mode === 'online' && !!ONL && ONL.me === 0 && !!App.state.online && App.state.online.joined; }
function plPresent() { return App.mode === 'online' && !!ONL && !!ONL.plat && ONL.plat.present; }
function noTable() { return plPresent() && !ONL.plat.override; }

function aSauvegarde() { return !!lire(SAVE_KEY); }
function sauver() {
  if (!App.state || App.mode !== 'solo') return;
  ecrire(SAVE_KEY, JSON.stringify({ mode: 'solo', state: App.state }));
}
function effacerSauvegarde() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignoré */ } }
const cleNotes = (gid, pid) => `em-notes-${gid}-${pid}`;
function lireMarques(view) {
  try { return JSON.parse(lire(cleNotes(view.gameId, view.you)) || '{}'); } catch (e) { return {}; }
}
function ecrireMarques(view, m) { ecrire(cleNotes(view.gameId, view.you), JSON.stringify(m)); }

// ---------- Rendu (ne doit JAMAIS écrire dans la partie) ----------
function render() {
  // On conserve les champs de saisie d'un rendu à l'autre.
  const champs = {};
  document.querySelectorAll('textarea[id], input[id]').forEach((el) => (champs[el.id] = el.value));
  const scroll = {};
  document.querySelectorAll('[data-keepscroll]').forEach((el) => (scroll[el.dataset.keepscroll] = el.scrollTop));
  let html = '';
  switch (App.screen) {
    case 'menu': html = UI.menuHTML(aSauvegarde()); break;
    case 'setup': html = UI.setupHTML(App.cfg); break;
    case 'online': html = UI.onlineHTML({ connecte: EL.connecte(), email: EL.email(), msg: App.ol.msg, list: App.ol.list }); break;
    case 'game': html = renderJeu(); break;
    case 'plateau': html = renderPlateau(); break;
  }
  $app.innerHTML = html;
  document.querySelectorAll('[data-keepscroll]').forEach((el) => {
    if (scroll[el.dataset.keepscroll] !== undefined) el.scrollTop = scroll[el.dataset.keepscroll];
  });
  for (const [id, v] of Object.entries(champs)) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = v;
  }
  scrollMini();
}

const quitterHTML = () => `<div class="topbar"><button class="btn small ghost" data-act="toMenu">← Menu</button>${App.mode === 'online' && ONL ? `<span class="muted small">Partie ${ONL.id}</span>` : ''}</div>`;
const offHTML = () => (App.off ? '<div class="warn offbar">Hors ligne : la partie reprendra dès le retour du réseau.</div>' : '');

// Sur téléphone, le plateau est agrandi dans un cadre défilant ; on le centre sur le pion du joueur.
function scrollMini() {
  const box = document.querySelector('.miniboard');
  if (!box || !App.state || App.screen !== 'game') return;
  const v = curView();
  const pos = v.pawns[v.you];
  if (!pos) return;
  const svg = box.querySelector('svg');
  const cx = pos.room ? (PIECE_PAR_ID[pos.room].r.x0 + PIECE_PAR_ID[pos.room].r.x1 + 1) / 2 : pos.x + 0.5;
  const cy = pos.room ? (PIECE_PAR_ID[pos.room].r.y0 + PIECE_PAR_ID[pos.room].r.y1 + 1) / 2 : pos.y + 0.5;
  const k = svg.getBoundingClientRect().width / 24;
  box.scrollLeft = Math.max(0, cx * k - box.clientWidth / 2);
  box.scrollTop = Math.max(0, cy * k - box.clientHeight / 2);
}

function overlayHTML() {
  const m = App.modal;
  if (!m) return '';
  if (m.kind === 'rules') return UI.reglesHTML();
  const view = curView();
  if (m.kind === 'carnet') return UI.carnetHTML(view, lireMarques(view), App.aide, false);
  if (m.kind === 'suggest' || m.kind === 'accuse') return UI.selectionHTML(view, m.kind, App.sel, false);
  if (m.kind === 'log') return `<div class="overlay"><div class="modal wide"><div class="mhead"><h2>Journal</h2><button class="btn small ghost" data-act="closeModal">Fermer</button></div>${UI.logHTML(view)}</div></div>`;
  return '';
}

function renderJeu() {
  const st = App.state;
  if (App.mode === 'online' && !st.online.joined) return UI.attenteHTML(ONL.id);
  const v = curView();
  const mon = v.actor === v.you;
  const fin = st.phase === 'over' && !App.finVue ? UI.finHTML(v, { online: App.mode === 'online' }) : '';

  if (App.mode === 'online') {
    // Plateau détecté : le téléphone cache la table commune (il garde main, carnet et boutons).
    const barre = plPresent()
      ? `<div class="tablebar"><span>📺 Plateau détecté</span><button class="btn small ghost" data-act="toggleTable">${ONL.plat.override ? 'Masquer la table' : 'Afficher la table'}</button></div>`
      : '';
    const sansTable = noTable();
    const deplace = v.phase === 'moving' && mon;
    // Pour choisir sa case, on a toujours besoin du plateau, même quand l'iPad l'affiche.
    let plateau = '';
    if (deplace) plateau = `<div class="miniboard">${UI.boardHTML(v, { clickable: true })}</div>`;
    else if (!sansTable) plateau = `<div class="fitboard">${UI.boardHTML(v, {})}</div>`;
    const corps = `<div class="phone">${quitterHTML()}${offHTML()}${barre}${UI.statutHTML(v)}${plateau}${UI.panelHTML(v, {})}${sansTable ? '' : UI.rosterHTML(v)}</div>`;
    return corps + overlayHTML() + fin;
  }

  // Solo : un seul écran, le joueur voit tout ce qui le concerne.
  const corps = `<div class="game"><section class="boardwrap">${UI.boardHTML(v, { clickable: mon })}</section><aside class="side">${quitterHTML()}${UI.statutHTML(v)}${UI.panelHTML(v, { log: true })}${UI.rosterHTML(v)}${UI.logHTML(v)}</aside></div>`;
  return corps + overlayHTML() + fin;
}

// Plateau commun : lecture seule, vue publique (aucune main, aucun dossier).
function renderPlateau() {
  const st = App.state;
  const tete = `<div class="plhead">📺 Plateau · ${PL ? PL.id : ''}</div>`;
  if (!st.online || !st.online.joined) {
    return `<div class="center"><div><div class="spinner" style="margin:0 auto 12px"></div><p>Plateau ${PL ? PL.id : ''} : en attente des joueurs…</p><button class="btn ghost" data-act="toMenu">Quitter</button></div></div>`;
  }
  const pub = E.vuePour(st, null);
  const fin = st.phase === 'over' ? UI.finHTML(pub, { plateau: true }) : '';
  return `<div class="game plateau"><section class="boardwrap">${UI.boardHTML(pub, {})}</section><aside class="side">${offHTML()}${tete}${UI.statutHTML(pub)}${UI.rosterHTML(pub)}${UI.historiqueHTML(pub)}${UI.logHTML(pub)}<button class="btn small ghost" data-act="toMenu">Quitter le plateau</button></aside></div>${fin}`;
}

// ---------- Jeu : actions et ordinateur ----------
let aiTimer = null;

function dispatch(action) {
  const st = App.state;
  if (window.__trace) window.__trace.push(JSON.stringify(action) + ' @' + st.phase);
  if (App.mode === 'online') {
    const j = E.joueur(st, action.by);
    const permis = action.by === curPid() || (isHost() && j && j.kind === 'ia');
    if (!permis || !st.online.joined) return;
  }
  const r = E.appliquer(st, action);
  if (!r.ok) {
    toast(r.err);
    return;
  }
  if (st.phase === 'over' && App.mode === 'solo') effacerSauvegarde();
  apresChangement();
}

function apresChangement() {
  App.modal = App.modal && ['carnet', 'log', 'rules'].includes(App.modal.kind) ? App.modal : null;
  if (App.mode === 'online') { ONL.dirty = true; pushState(); } else sauver();
  render();
  planifierOrdi();
}

function planifierOrdi() {
  clearTimeout(aiTimer);
  const st = App.state;
  if (!st || st.phase === 'over' || App.screen !== 'game') return;
  if (App.mode === 'online' && !isHost()) return; // seul l'hôte fait jouer les ordinateurs
  const acteur = E.joueur(st, E.acteurCourant(st));
  if (!acteur || acteur.kind !== 'ia') return;
  const delais = { start: 900, moving: 1000, act: 900, refuting: 800, after: 900 };
  const d = window.BOT_DELAY != null ? window.BOT_DELAY : delais[st.phase] || 900;
  aiTimer = setTimeout(() => {
    if (App.state !== st || st.phase === 'over' || App.screen !== 'game') return;
    const action = decider(E.vuePour(st, acteur.id), Math.random);
    if (action) dispatch(action);
  }, d);
}

function cfgJoueurs() {
  const joueurs = [];
  for (const s of SUSPECTS) {
    const r = App.cfg.roles[s.id];
    if (r.role === 'absent') continue;
    joueurs.push({ id: s.id, nom: r.role === 'moi' ? (r.nom || s.court).trim() || s.court : s.court, kind: r.role === 'ia' ? 'ia' : 'humain', niveau: r.niveau });
  }
  return joueurs;
}

function demarrerSolo() {
  App.state = E.nouvellePartie({ joueurs: cfgJoueurs() });
  App.mode = 'solo';
  App.modal = null;
  App.finVue = false;
  App.screen = 'game';
  sauver();
  render();
  planifierOrdi();
}

function goHome() {
  clearTimeout(aiTimer);
  plStop();
  if (ONL) onlineStop(); else if (App.mode === 'solo' && App.state && App.state.phase !== 'over') sauver();
  App.state = null;
  App.mode = null;
  App.modal = null;
  App.off = false;
  App.screen = 'menu';
  render();
}

// ---------- En ligne ----------
function olMsg(t) { App.ol.msg = t || ''; if (App.screen === 'online') render(); }
function olError(e) {
  if (e && e.kind === 'auth') { olMsg('Session expirée : reconnecte-toi.'); }
  else if (e && e.kind === 'reseau') olMsg("Pas de réseau : impossible de joindre le service pour l'instant.");
  else olMsg('Erreur : ' + (e && e.message ? e.message : 'inconnue'));
}
function olList() {
  if (!EL.connecte()) return;
  EL.liste(JEU).then((a) => { App.ol.list = a; if (App.screen === 'online') render(); }).catch(olError);
}
function olOpen() {
  App.screen = 'online';
  App.ol = { msg: '', list: null };
  render();
  olList();
}
function getMap() { try { return JSON.parse(lire(MAP_KEY)) || {}; } catch (e) { return {}; } }
function setMap(id, me) { const m = getMap(); m[id] = me; ecrire(MAP_KEY, JSON.stringify(m)); }
function titre() {
  const st = App.state;
  const noms = st.online.seats.map((pid) => (E.joueur(st, pid) || {}).nom || '?');
  const suite = !st.online.joined ? 'en attente' : st.phase === 'over' ? 'terminée' : 'tour ' + st.turnCount;
  return noms.join(' et ') + ' · ' + suite;
}
function onlineStart(id, me, version) {
  onlineStop();
  ONL = { id, me, version, dirty: false, pushing: false, status: 'ok', watch: null, retry: null };
  setMap(id, me);
  ONL.watch = EL.surveiller(id, () => (ONL ? ONL.version : 0), onRemote, onStatus);
  platWatch(ONL);
}
function onlineStop() {
  if (ONL) {
    if (ONL.watch) ONL.watch.stop();
    clearTimeout(ONL.retry);
    if (ONL.plat) { ONL.plat.stopped = true; clearTimeout(ONL.plat.timer); }
  }
  ONL = null;
  App.off = false;
}
function onStatus(st) {
  if (!ONL) return;
  ONL.status = st;
  App.off = st === 'hors-ligne';
  if (st === 'supprimee') { goHome(); olOpen(); olMsg('Cette partie a été supprimée.'); return; }
  if (st === 'auth') { goHome(); olOpen(); olError({ kind: 'auth' }); return; }
  if (st === 'ok' && ONL.dirty && !ONL.pushing) pushState();
  if (App.screen === 'game') render();
}
function onlineShow() {
  App.screen = 'game';
  App.modal = App.modal && ['carnet', 'log', 'rules'].includes(App.modal.kind) ? App.modal : null;
  render();
  planifierOrdi();
}
function takeRemote(row) {
  App.state = row.etat;
  ONL.version = row.version;
  App.sel = {};
  if (App.state.phase !== 'over') App.finVue = false;
}
function onRemote() {
  const o = ONL;
  if (!o || o.pushing || o.dirty) return;
  return EL.lire(o.id).then((row) => {
    if (ONL !== o || !row || row.version <= o.version || o.pushing || o.dirty) return;
    takeRemote(row);
    if (App.modal && (App.modal.kind === 'suggest' || App.modal.kind === 'accuse')) App.modal = null;
    onlineShow();
  });
}
function pushState() {
  const o = ONL;
  if (!o || o.pushing || !o.dirty) return;
  o.pushing = true;
  o.dirty = false;
  EL.ecrire(o.id, o.version, App.state, titre()).then((nv) => {
    if (ONL !== o) return;
    o.pushing = false;
    if (nv) {
      o.version = nv;
      if (o.status === 'hors-ligne') onStatus('ok');
      if (o.dirty) pushState();
      return;
    }
    // Conflit : l'autre appareil a écrit avant nous. Son état l'emporte, notre action est annulée.
    return EL.lire(o.id).then((row) => {
      if (ONL !== o || !row) return;
      o.dirty = false;
      takeRemote(row);
      if (App.state.online.uids.indexOf(EL.uid()) < 0) { goHome(); olOpen(); olMsg('Cette partie a déjà ses deux joueurs.'); return; }
      App.modal = null;
      onlineShow();
      toast("Ton action a été annulée : l'autre appareil a joué en même temps.");
    });
  }).catch((e) => {
    if (ONL !== o) return;
    o.pushing = false;
    o.dirty = true;
    onStatus(e && e.kind === 'reseau' ? 'hors-ligne' : 'erreur');
    if (e && e.kind === 'auth') return;
    clearTimeout(o.retry);
    o.retry = setTimeout(() => { if (ONL === o) pushState(); }, 2000);
  });
}
function onlineCreate() {
  const joueurs = cfgJoueurs();
  const st = E.nouvellePartie({ joueurs });
  const moi = SUSPECTS.find((s) => App.cfg.roles[s.id].role === 'moi').id;
  const inv = SUSPECTS.find((s) => App.cfg.roles[s.id].role === 'invite').id;
  st.online = { uids: [EL.uid(), null], joined: false, seats: [moi, inv] };
  EL.creer(JEU, st, E.joueur(st, moi).nom + ' · en attente').then((r) => {
    App.state = st;
    App.mode = 'online';
    App.finVue = false;
    onlineStart(r.id, 0, r.version);
    onlineShow();
  }).catch((e) => { olOpen(); olError(e); });
}
function seatFor(id, st) {
  let me = getMap()[id];
  if (me == null && st.online) { const k = st.online.uids.indexOf(EL.uid()); if (k >= 0) me = k; }
  return me;
}
function onlineJoin(code, nom) {
  code = (code || '').trim().toUpperCase();
  if (code.length !== 4) { olMsg('Le code a 4 lettres.'); return; }
  olMsg('');
  EL.lire(code).then((row) => {
    if (!row || row.jeu !== JEU) { olMsg('Code inconnu.'); return; }
    const st = row.etat;
    const me = seatFor(code, st);
    App.mode = 'online';
    App.finVue = false;
    if (me != null && (st.online.joined || me === 0)) { App.state = st; onlineStart(code, me, row.version); onlineShow(); return; }
    if (st.online.joined) { App.mode = null; olMsg('Cette partie a déjà ses deux joueurs.'); return; }
    App.state = st;
    onlineStart(code, 1, row.version);
    const j = E.joueur(st, st.online.seats[1]);
    if (nom && nom.trim()) j.nom = nom.trim();
    st.online.uids[1] = EL.uid();
    st.online.joined = true;
    st.log.push({ txt: `${j.nom} rejoint la partie.` });
    ONL.dirty = true;
    pushState();
    onlineShow();
  }).catch((e) => { App.mode = null; olError(e); });
}
function onlineResume(id) {
  olMsg('');
  EL.lire(id).then((row) => {
    if (!row) { olMsg('Partie introuvable.'); olList(); return; }
    const me = seatFor(id, row.etat);
    App.state = row.etat;
    App.mode = 'online';
    App.finVue = false;
    onlineStart(row.id, me != null ? me : 0, row.version);
    onlineShow();
  }).catch(olError);
}
function replay() { // « Rejouer » : même code, mêmes joueurs, nouveau dossier
  const st = App.state;
  const joueurs = st.players.map((p) => ({ id: p.id, nom: p.nom, kind: p.kind, niveau: p.niveau }));
  const ng = E.nouvellePartie({ joueurs });
  ng.online = st.online;
  App.state = ng;
  App.finVue = false;
  App.sel = {};
  apresChangement();
}

// ---------- Plateau : détection côté téléphone ----------
// Le plateau écrit régulièrement dans sa propre ligne (jeu « plateau », titre = code) : la ligne de la partie n'est jamais touchée,
// donc aucun conflit avec les coups. Le téléphone cache la table tant que cette ligne change (< 30 s) et la réaffiche seul si le
// plateau disparaît. Au 1er passage on note seulement la version : un reste d'une séance précédente ne compte pas.
function platPoll() { return window.PLATEAU_POLL != null ? window.PLATEAU_POLL : 5000; }
function platFresh() { return window.PLATEAU_FRESH != null ? window.PLATEAU_FRESH : 30000; }
function platBeatMs() { return window.PLATEAU_BEAT != null ? window.PLATEAU_BEAT : 10000; }
function platWatch(o) {
  const P = (o.plat = { present: false, override: false, ver: null, seen: 0, timer: null, stopped: false });
  const next = () => { if (ONL === o && !P.stopped) P.timer = setTimeout(tick, platPoll()); };
  function tick() {
    if (ONL !== o || P.stopped) return;
    clearTimeout(P.timer);
    if (document.hidden || !App.state || !App.state.online || !App.state.online.joined) { next(); return; }
    EL.liste('plateau').then((rows) => {
      if (ONL !== o || P.stopped) return;
      let r = null;
      const now = Date.now();
      rows.forEach((x) => { if (x.titre === o.id) r = x; });
      if (!r) { P.ver = null; P.seen = 0; }
      else if (P.ver == null) P.ver = r.version;
      else if (r.version !== P.ver) { P.ver = r.version; P.seen = now; }
      const pres = !!r && P.seen > 0 && now - P.seen < platFresh();
      if (pres !== P.present) {
        P.present = pres;
        if (!pres) P.override = false;
        if (App.screen === 'game') render();
      }
    }).catch(() => { /* réseau : on garde l'état connu */ }).then(next);
  }
  tick();
}

// ---------- Plateau : affichage seul (iPad commun) ----------
function plStop() {
  const o = PL;
  if (!o) return;
  if (o.watch) o.watch.stop();
  clearInterval(o.timer);
  clearTimeout(o.t2);
  if (o.rowId) EL.supprimer(o.rowId).catch(() => { /* la ligne vieillira toute seule */ });
  PL = null;
  App.off = false;
}
function plBeat() {
  const o = PL;
  if (!o || o.busy) return;
  o.busy = true;
  const data = { code: o.id, t: Date.now() };
  let p;
  if (o.rowId) {
    p = EL.ecrire(o.rowId, o.rowVer, data, o.id).then((nv) => {
      if (nv) { o.rowVer = nv; return; }
      return EL.lire(o.rowId).then((row) => { if (row) o.rowVer = row.version; else o.rowId = null; });
    });
  } else {
    p = EL.liste('plateau').then((rows) => {
      let r = null;
      rows.forEach((x) => { if (x.titre === o.id) r = x; });
      if (r) { o.rowId = r.id; o.rowVer = r.version; return; }
      return EL.creer('plateau', data, o.id).then((x) => { o.rowId = x.id; o.rowVer = x.version; });
    });
  }
  p.catch(() => { /* hors ligne : le prochain battement réessaiera */ }).then(() => {
    o.busy = false;
    if (PL !== o && o.rowId) EL.supprimer(o.rowId).catch(() => {});
  });
}
function plRemote() {
  const o = PL;
  if (!o) return;
  return EL.lire(o.id).then((row) => {
    if (PL !== o || !row || row.version <= o.version) return;
    App.state = row.etat;
    o.version = row.version;
    render();
  });
}
function plStatus(st) {
  if (!PL) return;
  if (st === 'supprimee') { goHome(); olOpen(); olMsg('Cette partie a été supprimée.'); return; }
  if (st === 'auth') { goHome(); olOpen(); olError({ kind: 'auth' }); return; }
  App.off = st === 'hors-ligne';
  render();
}
function plateauStart(code) {
  code = (code || '').trim().toUpperCase();
  if (code.length !== 4) { olMsg('Le code a 4 lettres.'); return; }
  olMsg('');
  EL.lire(code).then((row) => {
    if (!row || row.jeu !== JEU) { olMsg('Code inconnu.'); return; }
    onlineStop();
    plStop();
    clearTimeout(aiTimer);
    App.state = row.etat;
    App.mode = null;
    App.modal = null;
    App.screen = 'plateau';
    const o = (PL = { id: code, version: row.version, watch: null, rowId: null, rowVer: 0, timer: null, t2: null, busy: false });
    render();
    o.watch = EL.surveiller(code, () => (PL ? PL.version : 0), plRemote, plStatus);
    plBeat();
    o.t2 = setTimeout(plBeat, 1500);
    o.timer = setInterval(plBeat, platBeatMs());
  }).catch(olError);
}

// ---------- Événements ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const seatEl = el.closest('[data-seat]');
  const seatPid = (seatEl && seatEl.dataset.seat) || curPid() || (App.state ? E.acteurCourant(App.state) : null);
  const val = (id) => ((document.getElementById(id) || {}).value || '').trim();

  switch (act) {
    // navigation
    case 'toMenu': goHome(); return;
    case 'toSetup':
      App.cfg = defautCfg(el.dataset.mode || App.cfg.mode);
      App.cfg.roles.corail.nom = lire('em-nom') || 'Corail';
      App.screen = 'setup';
      break;
    case 'toOnline': olOpen(); return;
    case 'openRules':
      if (App.screen !== 'game') { $app.insertAdjacentHTML('beforeend', UI.reglesHTML()); return; }
      App.modal = { kind: 'rules' };
      break;
    case 'resume': {
      try {
        const s = JSON.parse(lire(SAVE_KEY));
        if (!s || s.mode === 'face' || s.mode === 'tel' || (s.mode === 'passe' && s.state.players.filter((p) => p.kind === 'humain').length !== 1)) throw new Error('ancien mode');
        App.state = s.state;
        App.mode = 'solo';
        App.finVue = false;
        App.screen = 'game';
        render();
        planifierOrdi();
        return;
      } catch (e) {
        effacerSauvegarde();
        toast('Sauvegarde illisible ou d’un ancien mode.');
      }
      break;
    }
    // configuration
    case 'setRole': {
      const id = el.dataset.id, v = el.dataset.v;
      if (v === 'moi' || v === 'invite') {
        for (const s of SUSPECTS) if (App.cfg.roles[s.id].role === v) App.cfg.roles[s.id].role = 'ia';
      }
      App.cfg.roles[id].role = v;
      break;
    }
    case 'setLvl': App.cfg.roles[el.dataset.id].niveau = Number(el.dataset.v); break;
    case 'startGame':
      if (App.cfg.mode === 'online') { onlineCreate(); return; }
      demarrerSolo();
      return;
    // en ligne
    case 'olLogin':
      EL.login(val('olEmail'), val('olPwd')).then(() => { App.ol.msg = ''; olOpen(); }).catch((e) => {
        olMsg(e && e.status === 400 ? 'E-mail ou mot de passe incorrect.' : e && e.kind === 'reseau' ? 'Pas de réseau.' : 'Connexion impossible.');
      });
      return;
    case 'olLogout': EL.logout(); App.ol = { msg: '', list: null }; break;
    case 'olJoin': {
      const nom = val('nomInp');
      if (nom) ecrire('em-nom', nom);
      onlineJoin(val('codeInp'), nom);
      return;
    }
    case 'olResume': onlineResume(el.dataset.id); return;
    case 'olDel':
      EL.supprimer(el.dataset.id).then(olList).catch(olError);
      return;
    case 'platStart': plateauStart(val('platInp')); return;
    case 'toggleTable': if (ONL && ONL.plat) ONL.plat.override = !ONL.plat.override; break;
    case 'replay': replay(); return;
    // jeu
    case 'roll': dispatch({ by: seatPid, type: 'roll' }); return;
    case 'passage': dispatch({ by: seatPid, type: 'passage' }); return;
    case 'stay': dispatch({ by: seatPid, type: 'stay' }); return;
    case 'end': dispatch({ by: seatPid, type: 'end' }); return;
    case 'show': dispatch({ by: seatPid, type: 'show', card: el.dataset.card }); return;
    case 'moveRoom':
      if (E.acteurCourant(App.state) !== curPid()) return;
      dispatch({ by: curPid(), type: 'move', dest: { room: el.dataset.room } });
      return;
    case 'moveCell':
      if (E.acteurCourant(App.state) !== curPid()) return;
      dispatch({ by: curPid(), type: 'move', dest: { x: Number(el.dataset.x), y: Number(el.dataset.y) } });
      return;
    case 'openSuggest': App.sel = {}; App.modal = { kind: 'suggest', pid: seatPid }; break;
    case 'openAccuse': App.sel = {}; App.modal = { kind: 'accuse', pid: seatPid }; break;
    case 'pick': App.sel = { ...App.sel, [el.dataset.type]: el.dataset.card }; break;
    case 'doSuggest': {
      const { s, a } = App.sel;
      const pid = App.modal.pid;
      App.modal = null;
      dispatch({ by: pid, type: 'suggest', s, a });
      return;
    }
    case 'doAccuse': {
      const { s, a, p } = App.sel;
      const pid = App.modal.pid;
      App.modal = null;
      dispatch({ by: pid, type: 'accuse', s, a, p });
      return;
    }
    case 'openCarnet': App.modal = { kind: 'carnet', pid: curPid() }; break;
    case 'openLog': App.modal = { kind: 'log', pid: curPid() }; break;
    case 'closeModal':
      if (App.state && App.state.phase === 'over') App.finVue = true;
      App.modal = null;
      break;
    case 'toggleAide':
      App.aide = !App.aide;
      ecrire('em-aide', App.aide ? '1' : '0');
      break;
    case 'mark': {
      const view = curView();
      const marks = lireMarques(view);
      const next = UI.marqueSuivante(marks[el.dataset.key]);
      if (next) marks[el.dataset.key] = next; else delete marks[el.dataset.key];
      ecrireMarques(view, marks);
      break;
    }
    default: return;
  }
  render();
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.classList && el.classList.contains('nameinp') && el.dataset.id) {
    App.cfg.roles[el.dataset.id].nom = el.value;
    if (App.cfg.roles[el.dataset.id].role === 'moi') ecrire('em-nom', el.value);
  }
});

window.addEventListener('offline', () => { if (ONL) onStatus('hors-ligne'); });
window.addEventListener('online', () => { if (ONL && ONL.watch) ONL.watch.poke(); });

// ---------- Démarrage ----------
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__app = App; // utile pour le débogage et les tests
window.__render = render;
window.__scrollMini = scrollMini;
