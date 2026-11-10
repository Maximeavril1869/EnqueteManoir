// Chef d'orchestre : écrans, modes de jeu (passe-passe, face à face, téléphones), ordinateur, sauvegarde.
import * as E from './engine.js';
import { decider } from './ai.js';
import * as UI from './ui.js';
import { SalonHote, ClientTel } from './net.js';
import { SUSPECTS, SUSPECT_PAR_ID, PIECE_PAR_ID } from './data.js';

const $app = document.getElementById('app');
const SAVE_KEY = 'em-save-v1';

const App = {
  screen: 'menu',
  cfg: defautCfg(),
  mode: null, // passe | face | tel (hôte) | client
  state: null, // partie complète (local ou hôte)
  view: null, // dernière vue reçue (client)
  unlocked: null,
  modal: null, // { kind, pid }
  sel: {},
  aide: localStorage.getItem('em-aide') === '1',
  finVue: false,
  host: null,
  client: null,
  salon: { erreur: '', code: '', qr: '', url: '', manuel: null },
  join: { etape: 'code', code: '', seats: [], erreur: '' },
  coupe: false,
};

function defautCfg() {
  const roles = {};
  for (const s of SUSPECTS) roles[s.id] = { role: 'absent', nom: s.court, niveau: 2 };
  roles.corail.role = 'humain';
  roles.safran.role = 'ia';
  roles.sauge.role = 'ia';
  return { mode: 'passe', roles };
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

function humains() {
  return App.state ? App.state.players.filter((p) => p.kind === 'humain') : [];
}
function vueDe(pid) {
  if (App.mode === 'client') return App.view;
  return E.vuePour(App.state, pid);
}
function aSauvegarde() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
function sauver() {
  if (!App.state || App.mode === 'tel') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ mode: App.mode, state: App.state }));
  } catch (e) { /* stockage plein ou refusé */ }
}
function effacerSauvegarde() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignoré */ }
}
const cleNotes = (gid, pid) => `em-notes-${gid}-${pid}`;
function lireMarques(view) {
  try { return JSON.parse(localStorage.getItem(cleNotes(view.gameId, view.you)) || '{}'); } catch (e) { return {}; }
}
function ecrireMarques(view, m) {
  try { localStorage.setItem(cleNotes(view.gameId, view.you), JSON.stringify(m)); } catch (e) { /* ignoré */ }
}

// ---------- Rendu ----------
function render() {
  // On conserve les champs de saisie et le volet « secours » ouvert d'un rendu à l'autre.
  const champs = {};
  document.querySelectorAll('textarea[id], input[id]').forEach((el) => (champs[el.id] = el.value));
  const ouvert = !!document.querySelector('details.manuel[open]');
  const scroll = {};
  document.querySelectorAll('[data-keepscroll]').forEach((el) => (scroll[el.dataset.keepscroll] = el.scrollTop));
  let html = '';
  switch (App.screen) {
    case 'menu': html = UI.menuHTML(aSauvegarde()); break;
    case 'setup': html = UI.setupHTML(App.cfg); break;
    case 'salon': html = renderSalon(); break;
    case 'join': html = UI.rejoindreHTML(App.join); break;
    case 'game': html = renderJeu(); break;
  }
  $app.innerHTML = html;
  document.querySelectorAll('[data-keepscroll]').forEach((el) => {
    if (scroll[el.dataset.keepscroll] !== undefined) el.scrollTop = scroll[el.dataset.keepscroll];
  });
  for (const [id, v] of Object.entries(champs)) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = v;
  }
  if (ouvert) document.querySelectorAll('details.manuel').forEach((d) => (d.open = true));
  scrollMini();
}

// Sur téléphone, le plateau est agrandi dans un cadre défilant ; on le centre sur le pion du joueur.
function scrollMini() {
  const box = document.querySelector('.miniboard');
  const v = App.view;
  if (!box || !v || App.mode !== 'client') return;
  const svg = box.querySelector('svg');
  const pos = v.pawns[v.you];
  const cx = pos.room ? (PIECE_PAR_ID[pos.room].r.x0 + PIECE_PAR_ID[pos.room].r.x1 + 1) / 2 : pos.x + 0.5;
  const cy = pos.room ? (PIECE_PAR_ID[pos.room].r.y0 + PIECE_PAR_ID[pos.room].r.y1 + 1) / 2 : pos.y + 0.5;
  const k = svg.getBoundingClientRect().width / 24;
  box.scrollLeft = Math.max(0, cx * k - box.clientWidth / 2);
  box.scrollTop = Math.max(0, cy * k - box.clientHeight / 2);
}

function renderSalon() {
  const h = App.host;
  return UI.salonHTML({
    code: App.salon.code,
    url: App.salon.url,
    qr: App.salon.qr,
    erreur: App.salon.erreur,
    seats: h ? h.listeSeats() : [],
    pret: h ? h.pret() : false,
  });
}

function overlayHTML() {
  const m = App.modal;
  if (!m) return '';
  if (m.kind === 'rules') return UI.reglesHTML();
  const view = vueDe(m.pid);
  const rot = App.mode === 'face' && humains().findIndex((p) => p.id === m.pid) === 1;
  if (m.kind === 'carnet') return UI.carnetHTML(view, lireMarques(view), App.aide, rot);
  if (m.kind === 'suggest' || m.kind === 'accuse') return UI.selectionHTML(view, m.kind, App.sel, rot);
  if (m.kind === 'log') return `<div class="overlay"><div class="modal wide"><div class="mhead"><h2>Journal</h2><button class="btn small ghost" data-act="closeModal">Fermer</button></div>${UI.logHTML(view)}</div></div>`;
  return '';
}

// Le plateau n'est cliquable que lorsque c'est à un humain de se déplacer (jamais pendant le tour de l'ordi).
function acteurHumain() {
  if (!App.state) return false;
  const a = E.joueur(App.state, E.acteurCourant(App.state));
  return !!a && a.kind === 'humain';
}

function renderJeu() {
  const m = App.mode;
  let corps = '';
  let fin = '';
  if (m === 'client') {
    const v = App.view;
    if (!v) return '<div class="center"><div class="spinner"></div></div>';
    const monTour = v.actor === v.you && v.phase === 'moving';
    corps = `<div class="phone">${App.coupe ? '<div class="warn">Connexion perdue… reconnexion en cours.</div>' : ''}${UI.statutHTML(v)}${monTour ? `<div class="miniboard">${UI.boardHTML(v, { clickable: true })}</div>` : ''}${UI.panelHTML(v, {})}${UI.rosterHTML(v)}</div>`;
    if (v.phase === 'over' && !App.finVue) fin = UI.finHTML(v, false);
    return corps + overlayHTML() + fin;
  }
  const st = App.state;
  const pub = E.vuePour(st, null);
  const over = st.phase === 'over';
  if (over && !App.finVue) fin = UI.finHTML(pub, false);

  if (m === 'face') {
    const hs = humains();
    const pan = (p, rot) => (p ? UI.panelHTML(E.vuePour(st, p.id), { hold: true, rot, log: true }) : '<div class="seat empty"></div>');
    corps = `<div class="game face"><div class="seatwrap top">${pan(hs[1], true)}</div>
      <div class="mid"><aside class="sideL">${UI.rosterHTML(pub)}${UI.logHTML(pub)}</aside><section class="boardwrap">${UI.boardHTML(pub, { clickable: acteurHumain() })}</section><aside class="sideR">${UI.statutHTML(pub)}</aside></div>
      <div class="seatwrap bottom">${pan(hs[0], false)}</div></div>`;
    return corps + overlayHTML() + fin;
  }

  if (m === 'tel') {
    corps = `<div class="game"><section class="boardwrap">${UI.boardHTML(pub, { clickable: acteurHumain() })}</section><aside class="side">${UI.statutHTML(pub)}${UI.rosterHTML(pub)}${UI.logHTML(pub)}${App.host ? rosterTel() : ''}</aside></div>`;
    return corps + fin;
  }

  // passe-passe
  const hs = humains();
  const actor = E.acteurCourant(st);
  const actorHum = hs.find((p) => p.id === actor);
  let seat = null;
  if (actorHum) {
    if (hs.length === 1) App.unlocked = actorHum.id;
    if (App.unlocked !== actorHum.id) {
      return `<div class="game"><section class="boardwrap"></section></div>${UI.passeHTML(actorHum.nom, SUSPECT_PAR_ID[actorHum.id].couleur)}`;
    }
    seat = actorHum.id;
  } else if (hs.length === 1) {
    seat = hs[0].id; // un seul humain : il peut garder son panneau pendant que l'ordi joue
  }
  const vue = seat ? E.vuePour(st, seat) : pub;
  const panneau = seat ? UI.panelHTML(vue, { log: true }) : '';
  corps = `<div class="game"><section class="boardwrap">${UI.boardHTML(vue, { clickable: acteurHumain() })}</section><aside class="side">${UI.statutHTML(vue)}${panneau}${UI.rosterHTML(vue)}${UI.logHTML(vue)}</aside></div>`;
  return corps + overlayHTML() + fin;
}

function rosterTel() {
  const h = App.host;
  const etats = h.listeSeats().filter((s) => s.etat !== 'pris');
  if (!etats.length) return '';
  return `<div class="warn">⚠️ Téléphone déconnecté : ${etats.map((s) => UI.esc(s.nom)).join(', ')}. Le jeu reprendra dès sa reconnexion.</div>`;
}

// ---------- Jeu : actions et ordinateur ----------
let aiTimer = null;

function dispatch(action) {
  if (window.__trace) window.__trace.push(JSON.stringify(action) + ' @' + (App.state ? App.state.phase : '?'));
  if (App.mode === 'client') {
    App.client.agir(action);
    return;
  }
  const r = E.appliquer(App.state, action);
  if (!r.ok) {
    toast(r.err);
    return;
  }
  if (App.state.phase === 'over') effacerSauvegarde();
  apresChangement();
}

function apresChangement() {
  const st = App.state;
  // En passe-passe, on verrouille dès que l'acteur change.
  if (App.mode === 'passe') {
    const act = E.acteurCourant(st);
    if (act !== App.unlocked) App.unlocked = null;
  }
  sauver();
  if (App.host) App.host.envoyerVues();
  App.modal = App.modal && ['carnet', 'log', 'rules'].includes(App.modal.kind) ? App.modal : null;
  render();
  planifierOrdi();
}

function planifierOrdi() {
  clearTimeout(aiTimer);
  const st = App.state;
  if (!st || st.phase === 'over' || App.screen !== 'game') return;
  const acteur = E.joueur(st, E.acteurCourant(st));
  if (acteur.kind !== 'ia') return;
  const delais = { start: 900, moving: 1000, act: 900, refuting: 800, after: 900 };
  aiTimer = setTimeout(() => {
    if (App.state !== st || st.phase === 'over') return;
    const vue = E.vuePour(st, acteur.id);
    const action = decider(vue, Math.random);
    if (action) dispatch(action);
  }, window.__fastAI ? 15 : delais[st.phase] || 900);
}

function demarrerPartie(mode) {
  const joueurs = [];
  for (const s of SUSPECTS) {
    const r = App.cfg.roles[s.id];
    if (r.role === 'absent') continue;
    joueurs.push({ id: s.id, nom: (r.nom || s.court).trim() || s.court, kind: r.role === 'humain' ? 'humain' : 'ia', niveau: r.niveau });
  }
  App.state = E.nouvellePartie({ joueurs });
  App.mode = mode;
  App.unlocked = null;
  App.modal = null;
  App.finVue = false;
  App.screen = 'game';
  sauver();
  render();
  planifierOrdi();
}

// ---------- Mode téléphones : hôte ----------
async function ouvrirSalon() {
  const seats = SUSPECTS.filter((s) => App.cfg.roles[s.id].role === 'humain').map((s) => ({ id: s.id, nom: s.nom, couleur: s.couleur }));
  App.salon = { erreur: '', code: '', qr: '', url: '', manuel: null };
  App.host = new SalonHote(seats, {
    change: () => {
      if (App.screen === 'salon') render();
      else if (App.screen === 'game') {
        render();
        App.host.envoyerVues();
      }
    },
    action: (a) => dispatch(a),
    erreur: (msg) => {
      App.salon.erreur = 'Connexion : ' + msg;
      render();
    },
  });
  App.screen = 'salon';
  render();
  try {
    const code = await App.host.ouvrir();
    App.salon.code = code;
    App.salon.url = `${location.origin}${location.pathname}?join=${code}`;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(App.salon.url);
      qr.make();
      App.salon.qr = qr.createSvgTag({ cellSize: 4, margin: 2 });
    } catch (e) { /* QR facultatif */ }
  } catch (e) {
    App.salon.erreur = (e && e.message) || String(e);
    App.salon.erreur += ' Tu peux utiliser la connexion manuelle ci-dessous.';
  }
  if (App.screen === 'salon') render();
}

function lancerTel() {
  if (!App.host || !App.host.pret()) return;
  const joueurs = [];
  for (const s of SUSPECTS) {
    const r = App.cfg.roles[s.id];
    if (r.role === 'absent') continue;
    joueurs.push({ id: s.id, nom: s.court, kind: r.role === 'humain' ? 'humain' : 'ia', niveau: r.niveau });
  }
  App.state = E.nouvellePartie({ joueurs });
  App.mode = 'tel';
  App.finVue = false;
  App.screen = 'game';
  App.host.lancer((pid) => E.vuePour(App.state, pid));
  render();
  planifierOrdi();
}

// ---------- Mode téléphones : client ----------
function creerClient() {
  App.client = new ClientTel({
    salon: (seats, demarre) => {
      App.join.seats = seats;
      if (App.join.etape === 'code') App.join.etape = 'choix';
      if (App.screen === 'join') render();
    },
    claimed: (pid) => {
      App.join.etape = 'attente';
      try { sessionStorage.setItem('em-join', JSON.stringify({ code: App.join.code, pid })); } catch (e) { /* ignoré */ }
      if (App.screen === 'join') render();
    },
    vue: (v) => {
      App.view = v;
      App.mode = 'client';
      App.coupe = false;
      if (App.screen !== 'game') App.screen = 'game';
      render();
    },
    erreur: (msg) => {
      App.join.erreur = msg;
      if (App.screen === 'join') render();
      else toast(msg);
    },
    coupe: () => {
      if (App.screen === 'game') {
        App.coupe = true;
        render();
        reconnecter();
      } else {
        App.join.erreur = 'Connexion perdue.';
        App.join.etape = 'code';
        if (App.screen === 'join') render();
      }
    },
  });
}

async function rejoindre(code) {
  App.join.code = code;
  App.join.erreur = '';
  creerClient();
  try {
    await App.client.connecter(code);
  } catch (e) {
    App.join.erreur = e.message || String(e);
    App.join.etape = 'code';
    render();
  }
}

let reco = null;
function reconnecter() {
  clearTimeout(reco);
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('em-join') || 'null'); } catch (e) { /* ignoré */ }
  if (!saved) return;
  reco = setTimeout(async () => {
    if (!App.coupe) return;
    const ancien = App.client;
    creerClient();
    // Après reconnexion, on reprend automatiquement la même place.
    const rappelSalon = App.client.rappels.salon;
    App.client.rappels.salon = (seats, demarre) => {
      rappelSalon(seats, demarre);
      App.client.choisir(saved.pid);
    };
    try {
      await App.client.connecter(saved.code);
    } catch (e) {
      App.client = ancien;
      reconnecter();
    }
  }, 3000);
}

// ---------- Événements ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const seatEl = el.closest('[data-seat]');
  const seatPid = (seatEl && seatEl.dataset.seat) || (App.mode === 'client' && App.view ? App.view.you : null) || (App.state ? E.acteurCourant(App.state) : null);
  const acteur = App.mode === 'client' ? (App.view && App.view.you) : App.state && E.acteurCourant(App.state);

  switch (act) {
    // navigation
    case 'toMenu':
      clearTimeout(aiTimer);
      clearTimeout(reco);
      if (App.host) { App.host.fermer(); App.host = null; }
      if (App.client && App.client.conn) { try { App.client.conn.close(); } catch (e) { /* ignoré */ } }
      App.client = null;
      App.coupe = false;
      App.modal = null;
      App.screen = 'menu';
      break;
    case 'toSetup': App.screen = 'setup'; break;
    case 'toJoin': App.screen = 'join'; App.join = { etape: 'code', code: '', seats: [], erreur: '' }; break;
    case 'openRules':
      if (App.screen !== 'game') { $app.insertAdjacentHTML('beforeend', UI.reglesHTML()); return; }
      App.modal = { kind: 'rules' };
      break;
    case 'resume': {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        App.state = s.state;
        App.mode = s.mode;
        App.unlocked = null;
        App.finVue = false;
        App.screen = 'game';
        render();
        planifierOrdi();
        return;
      } catch (e) {
        effacerSauvegarde();
        toast('Sauvegarde illisible.');
      }
      break;
    }
    // configuration
    case 'setMode': App.cfg.mode = el.dataset.v; break;
    case 'setRole': App.cfg.roles[el.dataset.id].role = el.dataset.v; break;
    case 'setLvl': App.cfg.roles[el.dataset.id].niveau = Number(el.dataset.v); break;
    case 'startGame':
      if (App.cfg.mode === 'tel') { ouvrirSalon(); return; }
      demarrerPartie(App.cfg.mode);
      return;
    case 'launchTel': lancerTel(); return;
    // jeu
    case 'roll': dispatch({ by: seatPid, type: 'roll' }); return;
    case 'passage': dispatch({ by: seatPid, type: 'passage' }); return;
    case 'stay': dispatch({ by: seatPid, type: 'stay' }); return;
    case 'end': dispatch({ by: seatPid, type: 'end' }); return;
    case 'show': dispatch({ by: seatPid, type: 'show', card: el.dataset.card }); return;
    case 'moveRoom':
      if (App.mode !== 'client' && !acteurHumain()) return;
      dispatch({ by: acteur, type: 'move', dest: { room: el.dataset.room } });
      return;
    case 'moveCell':
      if (App.mode !== 'client' && !acteurHumain()) return;
      dispatch({ by: acteur, type: 'move', dest: { x: Number(el.dataset.x), y: Number(el.dataset.y) } });
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
    case 'openCarnet': App.modal = { kind: 'carnet', pid: el.dataset.pid || seatPid }; break;
    case 'openLog': App.modal = { kind: 'log', pid: seatPid }; break;
    case 'closeModal':
      if (App.state && App.state.phase === 'over' || (App.view && App.view.phase === 'over')) App.finVue = true;
      App.modal = null;
      break;
    case 'toggleAide':
      App.aide = !App.aide;
      try { localStorage.setItem('em-aide', App.aide ? '1' : '0'); } catch (e) { /* ignoré */ }
      break;
    case 'mark': {
      const view = vueDe(App.modal.pid);
      const marks = lireMarques(view);
      const next = UI.marqueSuivante(marks[el.dataset.key]);
      if (next) marks[el.dataset.key] = next; else delete marks[el.dataset.key];
      ecrireMarques(view, marks);
      break;
    }
    case 'unlock': App.unlocked = E.acteurCourant(App.state); break;
    // client
    case 'doJoin': {
      const code = (document.getElementById('codeInp') || {}).value || '';
      if (!/^\d{4}$/.test(code)) { App.join.erreur = 'Le code comporte 4 chiffres.'; break; }
      rejoindre(code);
      return;
    }
    case 'claim': App.client.choisir(el.dataset.id); return;
    // secours manuel
    case 'manuelOffre': creerInvitation(); return;
    case 'copyOffre': copier('manOffre'); return;
    case 'manuelRep': validerReponse(); return;
    case 'manuelJoin': repondreManuel(); return;
    case 'copyRep': copier('manRep'); return;
    default: return;
  }
  render();
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.classList && el.classList.contains('nameinp')) App.cfg.roles[el.dataset.id].nom = el.value;
});

// Cartes cachées en face à face : visibles seulement pendant l'appui.
document.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('[data-hold]');
  if (b) b.closest('.hand').classList.add('revealed');
});
const cacher = () => document.querySelectorAll('.hand.revealed').forEach((h) => h.classList.remove('revealed'));
document.addEventListener('pointerup', cacher);
document.addEventListener('pointercancel', cacher);

async function creerInvitation() {
  const champ = document.getElementById('manOffre');
  if (champ) champ.value = '';
  const rep = document.getElementById('manRep');
  if (rep) rep.value = '';
  try {
    const { texte, manuel } = await App.host.creerInvitation();
    App.salon.manuel = manuel;
    document.getElementById('manOffre').value = texte;
  } catch (e) {
    toast('Invitation impossible : ' + (e.message || e));
  }
}
async function validerReponse() {
  try {
    await App.host.validerReponse(App.salon.manuel, document.getElementById('manRep').value);
    toast('Réponse validée, connexion en cours…');
  } catch (e) {
    toast('Réponse invalide.');
  }
}
async function repondreManuel() {
  try {
    creerClient();
    const rep = await App.client.repondreInvitation(document.getElementById('manOffre').value);
    document.getElementById('manRep').value = rep;
    toast('Copie la réponse vers l’iPad.');
  } catch (e) {
    toast('Invitation invalide.');
  }
}
function copier(id) {
  const t = document.getElementById(id);
  if (!t) return;
  t.select();
  try {
    navigator.clipboard.writeText(t.value);
    toast('Copié.');
  } catch (e) {
    document.execCommand('copy');
  }
}

// ---------- Démarrage ----------
const params = new URLSearchParams(location.search);
if (params.get('join')) {
  App.screen = 'join';
  App.join = { etape: 'code', code: params.get('join'), seats: [], erreur: '' };
  render();
  rejoindre(params.get('join'));
} else {
  render();
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__app = App; // utile pour le débogage et les tests
window.__render = render;
window.__scrollMini = scrollMini;
