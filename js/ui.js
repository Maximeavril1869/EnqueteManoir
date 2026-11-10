// Rendu : tout est produit sous forme de chaînes HTML/SVG à partir d'une « vue » (cf. engine.vuePour).
import {
  SUSPECTS, ARMES, PIECES, CARTES, CARTE_PAR_ID, TYPES, GRILLE, PORTES, PASSAGES, CENTRE, W, H,
  SUSPECT_PAR_ID, ARME_PAR_ID, PIECE_PAR_ID, nomCarte,
} from './data.js';
import { deduire, statutCarte, candidatsDossier, ENV } from './knowledge.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = 30;

// ---------- Plateau ----------
export function boardHTML(view, opts = {}) {
  const clic = !!opts.clickable && view.phase === 'moving';
  const atteignCells = clic ? new Set(view.reach.cells.map(([x, y]) => y * W + x)) : new Set();
  const atteignRooms = clic ? new Set(view.reach.rooms) : new Set();
  const o = [];
  o.push(`<svg class="board" viewBox="0 0 ${W * S} ${H * S}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plateau du manoir">`);
  o.push(`<rect width="${W * S}" height="${H * S}" rx="14" fill="#2b2118"/>`);
  // couloirs
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (GRILLE[y][x] === 0) o.push(`<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="#e8dcc0" stroke="#bba982" stroke-width=".7"/>`);
    }
  }
  for (const su of SUSPECTS) {
    o.push(`<rect x="${su.depart.x * S + 3}" y="${su.depart.y * S + 3}" width="${S - 6}" height="${S - 6}" rx="5" fill="none" stroke="${su.couleur}" stroke-width="2.5" opacity=".9"/>`);
  }
  // centre
  o.push(`<rect x="${CENTRE.x0 * S}" y="${CENTRE.y0 * S}" width="${(CENTRE.x1 - CENTRE.x0 + 1) * S}" height="${(CENTRE.y1 - CENTRE.y0 + 1) * S}" rx="10" fill="#3b2a1c" stroke="#8a6a3d" stroke-width="2"/>`);
  o.push(`<text x="${(CENTRE.x0 + 3) * S}" y="${(CENTRE.y0 + 3.2) * S}" text-anchor="middle" font-size="34">🗝️</text>`);
  o.push(`<text x="${(CENTRE.x0 + 3) * S}" y="${(CENTRE.y0 + 4.6) * S}" text-anchor="middle" font-size="13" font-weight="700" fill="#d9b26b">DOSSIER</text>`);
  o.push(`<text x="${(CENTRE.x0 + 3) * S}" y="${(CENTRE.y0 + 5.3) * S}" text-anchor="middle" font-size="13" font-weight="700" fill="#d9b26b">CONFIDENTIEL</text>`);
  // pièces
  for (const p of PIECES) {
    const x = p.r.x0 * S, y = p.r.y0 * S, w = (p.r.x1 - p.r.x0 + 1) * S, h = (p.r.y1 - p.r.y0 + 1) * S;
    const surb = atteignRooms.has(p.id);
    o.push(`<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="8" fill="${p.couleur}" stroke="${surb ? '#ffcf3f' : '#5a4632'}" stroke-width="${surb ? 5 : 2}"${surb ? ' class="roomglow"' : ''}/>`);
    o.push(`<text x="${x + w / 2}" y="${y + 17}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#3a2b1c">${esc(p.nom)}</text>`);
    if (PASSAGES[p.id]) o.push(`<text x="${x + w - 8}" y="${y + h - 8}" text-anchor="end" font-size="11" fill="#5a4632">⇄ ${esc(PIECE_PAR_ID[PASSAGES[p.id]].nom)}</text>`);
  }
  // portes
  for (const d of PORTES) {
    const [ox, oy] = d.out, [ix, iy] = d.in;
    if (ox === ix) {
      const edge = Math.max(oy, iy) * S;
      o.push(`<rect x="${ox * S + 5}" y="${edge - 3.5}" width="${S - 10}" height="7" rx="2" fill="#7a4b1e" stroke="#3a2210"/>`);
    } else {
      const edge = Math.max(ox, ix) * S;
      o.push(`<rect x="${edge - 3.5}" y="${oy * S + 5}" width="7" height="${S - 10}" rx="2" fill="#7a4b1e" stroke="#3a2210"/>`);
    }
  }
  // armes et pions dans les pièces
  const parPiece = {};
  for (const a of ARMES) (parPiece[view.weapons[a.id]] ||= []).push({ t: 'a', a });
  for (const su of SUSPECTS) {
    const pos = view.pawns[su.id];
    if (pos.room) (parPiece[pos.room] ||= []).push({ t: 's', su });
  }
  for (const p of PIECES) {
    const items = parPiece[p.id] || [];
    const w = (p.r.x1 - p.r.x0 + 1) * S;
    const cols = Math.max(1, Math.floor((w - 10) / 25));
    items.forEach((it, i) => {
      const cx = p.r.x0 * S + 17 + (i % cols) * 25;
      const cy = p.r.y0 * S + 40 + Math.floor(i / cols) * 25;
      if (it.t === 'a') o.push(`<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="19"><title>${esc(it.a.nom)}</title>${it.a.icone}</text>`);
      else o.push(pionSVG(view, it.su, cx, cy));
    });
  }
  // pions dans les couloirs
  for (const su of SUSPECTS) {
    const pos = view.pawns[su.id];
    if (pos.room) continue;
    o.push(pionSVG(view, su, pos.x * S + S / 2, pos.y * S + S / 2));
  }
  // zones cliquables
  if (clic) {
    for (const [x, y] of view.reach.cells) {
      o.push(`<g data-act="moveCell" data-x="${x}" data-y="${y}" class="hit"><rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="rgba(255,207,63,.45)" stroke="#e0a800" stroke-width="2"/><circle cx="${x * S + S / 2}" cy="${y * S + S / 2}" r="5" fill="#8a5a00"/></g>`);
    }
    for (const r of view.reach.rooms) {
      const p = PIECE_PAR_ID[r];
      o.push(`<rect data-act="moveRoom" data-room="${r}" class="hit" x="${p.r.x0 * S}" y="${p.r.y0 * S}" width="${(p.r.x1 - p.r.x0 + 1) * S}" height="${(p.r.y1 - p.r.y0 + 1) * S}" fill="rgba(255,207,63,.18)"/>`);
    }
  }
  o.push('</svg>');
  return o.join('');
}

function pionSVG(view, su, cx, cy) {
  const actif = view.actor === su.id || (view.phase !== 'refuting' && view.turnPid === su.id);
  const joue = view.players.some((p) => p.id === su.id);
  return `<g><circle cx="${cx}" cy="${cy}" r="${actif ? 11.5 : 10}" fill="${su.couleur}" stroke="${actif ? '#ffcf3f' : '#1a120c'}" stroke-width="${actif ? 3.5 : 2}"${actif ? ' class="pulse"' : ''}${joue ? '' : ' opacity=".55"'}><title>${esc(su.nom)}</title></circle><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="${su.id === 'ivoire' || su.id === 'safran' ? '#222' : '#fff'}">${su.lettre}</text></g>`;
}

// ---------- Journal et statut ----------
export function logHTML(view) {
  const l = view.log.slice(-40).reverse();
  return `<div class="logbox"><h3>Journal</h3><ul>${l.map((e) => `<li class="${e.to ? 'priv' : ''}">${e.to ? '🔒 ' : ''}${esc(e.txt)}</li>`).join('')}</ul></div>`;
}

export function statutHTML(view) {
  if (view.phase === 'over') {
    const w = view.players.find((p) => p.id === view.winner);
    return `<div class="banner win">🏆 ${esc(w ? w.nom : '')} a gagné !</div>`;
  }
  const act = view.players.find((p) => p.id === view.actor);
  const pion = act ? SUSPECT_PAR_ID[act.id] : null;
  let txt;
  if (view.phase === 'refuting') txt = `${esc(act.nom)} choisit la carte à montrer`;
  else if (act && act.kind === 'ia') txt = `🤖 ${esc(act.nom)} réfléchit…`;
  else txt = `Au tour de <b>${esc(act ? act.nom : '')}</b>`;
  const des = view.dice ? `<div class="dice"><span class="die">${view.dice[0]}</span><span class="die">${view.dice[1]}</span><span class="tot">= ${view.dice[0] + view.dice[1]}</span></div>` : '';
  return `<div class="banner"><span class="dot" style="background:${pion ? pion.couleur : '#999'}"></span><span>${txt}</span></div>${des}`;
}

// ---------- Panneau du joueur ----------
function chipCarte(id) {
  const c = CARTE_PAR_ID[id];
  const ic = c.type === 'a' ? c.icone + ' ' : c.type === 's' ? '👤 ' : '🏠 ';
  return `<span class="chip t-${c.type}">${ic}${esc(c.nom)}</span>`;
}

export function panelHTML(view, ctx = {}) {
  const me = view.players.find((p) => p.id === view.you);
  const su = me ? SUSPECT_PAR_ID[me.id] : null;
  const o = [];
  o.push(`<div class="seat${ctx.rot ? ' rot' : ''}" data-seat="${view.you || ''}">`);
  if (!me) {
    o.push('<div class="muted">Aucun joueur sur cet écran.</div></div>');
    return o.join('');
  }
  o.push(`<div class="seathead"><span class="dot" style="background:${su.couleur}"></span><b>${esc(me.nom)}</b>${me.eliminated ? ' <span class="tag">éliminé</span>' : ''}</div>`);
  // main
  const main = view.hand.map(chipCarte).join('');
  if (ctx.hold) {
    o.push(`<div class="hand hold"><button class="btn small holdbtn" data-hold="1">👁️ Maintiens pour voir tes cartes</button><div class="cards secret">${main}</div></div>`);
  } else {
    o.push(`<div class="hand"><div class="cards">${main}</div></div>`);
  }
  const lastReveal = view.reveals.length ? view.reveals[view.reveals.length - 1] : null;
  if (lastReveal && !ctx.hold) {
    const from = view.players.find((p) => p.id === lastReveal.from);
    o.push(`<div class="reveal">🔎 Dernière carte vue : ${chipCarte(lastReveal.card)} <span class="muted">(montrée par ${esc(from ? from.nom : '')})</span></div>`);
  }
  o.push(`<div class="actions">${actionsHTML(view)}</div>`);
  o.push(`<div class="seatbtns"><button class="btn small ghost" data-act="openCarnet" data-pid="${view.you}">📒 Carnet</button>${ctx.log ? '' : `<button class="btn small ghost" data-act="openLog">📜 Journal</button>`}</div>`);
  o.push('</div>');
  return o.join('');
}

function actionsHTML(view) {
  const c = view.can;
  const b = (act, txt, cls = '', extra = '') => `<button class="btn ${cls}" data-act="${act}"${extra}>${txt}</button>`;
  if (view.phase === 'over') return `<div class="muted">Partie terminée.</div>`;
  if (view.actor !== view.you) {
    const act = view.players.find((p) => p.id === view.actor);
    if (view.phase === 'refuting') return `<div class="muted">${esc(act.nom)} choisit la carte à montrer…</div>`;
    return `<div class="muted">${act && act.kind === 'ia' ? '🤖 ' : '⏳ '}Au tour de ${esc(act ? act.nom : '')}.</div>`;
  }
  const out = [];
  switch (view.phase) {
    case 'start':
      if (c.roll) out.push(b('roll', '🎲 Lancer les dés', 'primary'));
      if (c.passage) out.push(b('passage', `⇄ Passage secret → ${esc(PIECE_PAR_ID[view.passageVers].nom)}`));
      if (c.stay) out.push(b('stay', '💬 Rester ici et suggérer'));
      if (c.accuse) out.push(b('openAccuse', '⚖️ Accuser', 'danger'));
      break;
    case 'moving': {
      out.push(`<div class="hint">Choisis ta destination sur le plateau (cases jaunes).</div>`);
      for (const r of view.reach.rooms) out.push(b('moveRoom', `🚪 ${esc(PIECE_PAR_ID[r].nom)}`, '', ` data-room="${r}"`));
      break;
    }
    case 'act':
      if (c.suggest) out.push(b('openSuggest', '💬 Faire une suggestion', 'primary'));
      if (c.accuse) out.push(b('openAccuse', '⚖️ Accuser', 'danger'));
      if (c.end) out.push(b('end', 'Fin du tour', c.suggest ? 'ghost' : 'primary'));
      break;
    case 'refuting':
      out.push(`<div class="hint">Quelle carte montres-tu en secret ?</div>`);
      for (const id of view.showOptions) out.push(b('show', chipCarte(id), 'cardbtn', ` data-card="${id}"`));
      break;
    case 'after':
      if (c.accuse) out.push(b('openAccuse', '⚖️ Accuser', 'danger'));
      out.push(b('end', 'Fin du tour', 'primary'));
      break;
  }
  return out.join('');
}

// ---------- Fenêtres ----------
const modal = (inner, rot, cls = '') => `<div class="overlay${rot ? ' rot' : ''}"><div class="modal ${cls}" data-keepscroll="modal">${inner}</div></div>`;

export function selectionHTML(view, kind, sel, rot) {
  const piece = view.pawns[view.you] && view.pawns[view.you].room;
  const bloc = (titre, liste, type) => `<div class="group"><h4>${titre}</h4><div class="opts">${liste.map((c) => `<button class="opt${sel[type] === c.id ? ' on' : ''}" data-act="pick" data-type="${type}" data-card="${c.id}">${c.type === 'a' ? c.icone + ' ' : ''}${esc(c.nom)}</button>`).join('')}</div></div>`;
  const cs = CARTES.filter((c) => c.type === 's');
  const ca = CARTES.filter((c) => c.type === 'a');
  const cp = CARTES.filter((c) => c.type === 'p');
  let html;
  if (kind === 'suggest') {
    html = `<h2>Suggestion</h2><p class="muted">Dans : <b>${esc(PIECE_PAR_ID[piece].nom)}</b>. Le suspect et l'arme seront convoqués ici.</p>${bloc('Suspect', cs, 's')}${bloc('Arme', ca, 'a')}`;
    const ok = sel.s && sel.a;
    html += `<div class="mfoot"><button class="btn ghost" data-act="closeModal">Annuler</button><button class="btn primary" data-act="doSuggest"${ok ? '' : ' disabled'}>Suggérer</button></div>`;
  } else {
    html = `<h2>Accusation</h2><p class="warn">⚠️ Si tu te trompes, tu es éliminé de la partie.</p>${bloc('Suspect', cs, 's')}${bloc('Arme', ca, 'a')}${bloc('Pièce', cp, 'p')}`;
    const ok = sel.s && sel.a && sel.p;
    html += `<div class="mfoot"><button class="btn ghost" data-act="closeModal">Annuler</button><button class="btn danger" data-act="doAccuse"${ok ? '' : ' disabled'}>Accuser</button></div>`;
  }
  return modal(html, rot, 'wide');
}

export function carnetHTML(view, marks, aide, rot) {
  const joueurs = view.players;
  const K = aide ? deduire(view, 3) : null;
  const cols = [...joueurs.map((p) => ({ id: p.id, nom: p.nom, court: p.court || SUSPECT_PAR_ID[p.id].court, couleur: SUSPECT_PAR_ID[p.id].couleur })), { id: ENV, court: 'Dossier', couleur: '#d4a24c' }];
  const entete = cols.map((c) => `<th><span class="dot" style="background:${c.couleur}"></span><span class="colname">${esc(c.court)}</span></th>`).join('');
  const lignes = [];
  for (const t of TYPES) {
    lignes.push(`<tr class="grp"><th colspan="${cols.length + 1}">${t.nom}</th></tr>`);
    for (const c of CARTES.filter((x) => x.type === t.t)) {
      const tds = cols.map((col) => {
        const cle = c.id + '|' + col.id;
        let m = marks[cle] || '';
        let cls = '';
        let verr = false;
        if (col.id === view.you) {
          m = view.hand.includes(c.id) ? '✓' : '✗';
          verr = true;
          cls += ' lock';
        }
        let aideCls = '';
        let aideTxt = '';
        if (K && !verr) {
          const st = statutCarte(K, c.id, col.id);
          if (st === 'oui') { aideCls = col.id === ENV ? 'a-env' : 'a-oui'; aideTxt = col.id === ENV ? '★' : '✓'; }
          else if (st === 'non') { aideCls = 'a-non'; aideTxt = '✗'; }
        }
        const aff = m || (aideTxt ? `<span class="auto">${aideTxt}</span>` : '');
        return `<td class="mk ${cls} ${aideCls}" ${verr ? '' : `data-act="mark" data-key="${esc(cle)}"`}>${aff}</td>`;
      }).join('');
      lignes.push(`<tr><th class="cn">${c.type === 'a' ? c.icone + ' ' : ''}${esc(c.nom)}</th>${tds}</tr>`);
    }
  }
  let resume = '';
  if (K) {
    const cd = candidatsDossier(K);
    resume = `<div class="aidebox">Encore possible dans le dossier — Suspects : <b>${cd.s.map((id) => esc(nomCarte(id))).join(', ')}</b> · Armes : <b>${cd.a.map((id) => esc(nomCarte(id))).join(', ')}</b> · Pièces : <b>${cd.p.map((id) => esc(nomCarte(id))).join(', ')}</b></div>`;
  }
  const html = `<div class="mhead"><h2>📒 Carnet de déduction</h2><button class="btn small ghost" data-act="closeModal">Fermer</button></div>
  <div class="mtools"><label class="switch"><input type="checkbox" data-act="toggleAide"${aide ? ' checked' : ''}> Aide automatique</label><span class="muted">Touche une case : ✗ → ✓ → ? → vide</span></div>
  ${resume}
  <div class="tablewrap" data-keepscroll="carnet"><table class="carnet"><thead><tr><th></th>${entete}</tr></thead><tbody>${lignes.join('')}</tbody></table></div>`;
  return modal(html, rot, 'wide carnetmodal');
}

export function marqueSuivante(m) {
  return { '': '✗', '✗': '✓', '✓': '?', '?': '' }[m || ''];
}

export function passeHTML(nom, couleur) {
  return `<div class="overlay gate"><div class="gatebox"><div class="bigdot" style="background:${couleur}"></div><h1>Passe l'iPad à<br><b>${esc(nom)}</b></h1><p class="muted">Les autres joueurs ne regardent pas l'écran !</p><button class="btn primary big" data-act="unlock">Je suis ${esc(nom)}</button></div></div>`;
}

export function finHTML(view, rot) {
  const w = view.players.find((p) => p.id === view.winner);
  const sol = view.solution;
  const html = `<h2>🏆 ${esc(w.nom)} résout l'enquête !</h2>
  <p>Le crime a été commis par <b>${esc(nomCarte(sol.s))}</b>, avec <b>${esc(nomCarte(sol.a))}</b>, dans <b>${esc(nomCarte(sol.p))}</b>.</p>
  <div class="mfoot"><button class="btn ghost" data-act="closeModal">Voir le plateau</button><button class="btn primary" data-act="toMenu">Menu</button></div>`;
  return modal(html, rot);
}

export function reglesHTML() {
  const html = `<div class="mhead"><h2>Règles</h2><button class="btn small ghost" data-act="closeModal">Fermer</button></div>
  <div class="rules">
  <p><b>But :</b> découvrir <b>qui</b> a commis le crime, <b>avec quelle arme</b> et <b>dans quelle pièce</b>. Ces trois cartes sont dans le dossier confidentiel ; les 18 autres sont distribuées.</p>
  <p><b>Ton tour :</b> lance les deux dés et déplace-toi du nombre indiqué (cases en couloir, sans repasser deux fois par la même case ni traverser un autre pion). Une porte donne accès à une pièce, même avec des pas en trop. Depuis une pièce d'angle, tu peux à la place prendre le <b>passage secret</b> (Cuisine ⇄ Bureau, Véranda ⇄ Salon).</p>
  <p><b>Suggestion :</b> quand tu es dans une pièce, tu proposes un suspect et une arme ; ils sont convoqués dans la pièce. En tournant dans le sens des aiguilles d'une montre, le premier joueur qui possède l'une des trois cartes t'en montre une en secret.</p>
  <p>Un suspect déplacé par une suggestion peut, à son tour, rester dans la pièce pour suggérer sans lancer les dés.</p>
  <p><b>Accusation :</b> à tout moment de ton tour, tu peux accuser (suspect + arme + pièce). Exacte : tu gagnes. Fausse : tu es éliminé, mais tu continues à montrer tes cartes. Le dernier joueur en lice gagne.</p>
  <p class="muted">Les personnages de ce jeu sont originaux. Le plateau est une recréation proche du plateau classique, pas une copie case par case.</p></div>`;
  return modal(html, false, 'wide');
}

export function menuHTML(hasSave) {
  return `<div class="menu"><div class="logo">🕵️</div><h1>EnqueteManoir</h1><p class="muted">Un jeu d'enquête pour 2 à 6 détectives</p>
  <div class="menubtns">
    <button class="btn primary big" data-act="toSetup">Nouvelle partie</button>
    ${hasSave ? '<button class="btn big" data-act="resume">Reprendre la partie</button>' : ''}
    <button class="btn big" data-act="toJoin">📱 Rejoindre une partie (téléphone)</button>
    <button class="btn big ghost" data-act="openRules">Règles</button>
  </div><p class="small muted">© Tous droits réservés — Maximeavril1869 · v1.0</p></div>`;
}

export function setupHTML(cfg) {
  const modes = [
    ['passe', '🔁 Passe-passe', 'Un seul écran, on se passe l\'iPad à chaque tour'],
    ['face', '↕️ Face à face', '2 humains de chaque côté de l\'iPad (cartes cachées tant qu\'on ne maintient pas le bouton)'],
    ['tel', '📱 Téléphones', 'L\'iPad est le plateau, chaque joueur a ses cartes sur son téléphone'],
  ];
  const lignes = SUSPECTS.map((su) => {
    const r = cfg.roles[su.id];
    const seg = (v, txt) => `<button class="seg${r.role === v ? ' on' : ''}" data-act="setRole" data-id="${su.id}" data-v="${v}">${txt}</button>`;
    const humainTxt = cfg.mode === 'tel' ? 'Téléphone' : 'Humain';
    return `<div class="seatrow"><span class="dot big" style="background:${su.couleur}"></span><div class="sname"><b>${esc(su.nom)}</b>
      ${r.role === 'humain' && cfg.mode !== 'tel' ? `<input class="nameinp" data-id="${su.id}" value="${esc(r.nom)}" maxlength="16" aria-label="Prénom">` : ''}
      ${r.role === 'ia' ? `<div class="lvl">${[1, 2, 3].map((n) => `<button class="seg small${r.niveau === n ? ' on' : ''}" data-act="setLvl" data-id="${su.id}" data-v="${n}">${['Débutant', 'Moyen', 'Expert'][n - 1]}</button>`).join('')}</div>` : ''}
      </div><div class="roles">${seg('absent', 'Absent')}${seg('humain', humainTxt)}${seg('ia', '🤖 Ordi')}</div></div>`;
  }).join('');
  const nb = Object.values(cfg.roles).filter((r) => r.role !== 'absent').length;
  const nbH = Object.values(cfg.roles).filter((r) => r.role === 'humain').length;
  let probleme = '';
  if (nb < 2) probleme = 'Il faut au moins 2 joueurs.';
  else if (nbH < 1) probleme = 'Il faut au moins un joueur humain.';
  else if (cfg.mode === 'face' && nbH > 2) probleme = 'Le face à face est limité à 2 humains (utilise passe-passe ou téléphones sinon).';
  return `<div class="setup"><div class="mhead"><button class="btn small ghost" data-act="toMenu">← Menu</button><h2>Nouvelle partie</h2></div>
  <div class="modes">${modes.map(([v, t, d]) => `<button class="modecard${cfg.mode === v ? ' on' : ''}" data-act="setMode" data-v="${v}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>
  <h3>Joueurs <span class="muted">(${nb})</span></h3><div class="seatlist">${lignes}</div>
  ${probleme ? `<p class="warn">${probleme}</p>` : ''}
  <div class="mfoot"><button class="btn primary big" data-act="startGame"${probleme ? ' disabled' : ''}>${cfg.mode === 'tel' ? 'Ouvrir le salon' : 'Commencer'}</button></div></div>`;
}

export function salonHTML(info) {
  // info : { code, url, qr, seats:[{id,nom,couleur,etat}], pret, erreur, manuel }
  const lignes = info.seats.map((s) => `<div class="seatrow"><span class="dot big" style="background:${s.couleur}"></span><b>${esc(s.nom)}</b><span class="etat ${s.etat}">${{ libre: 'en attente…', pris: '✅ connecté', coupe: '⚠️ déconnecté' }[s.etat]}</span></div>`).join('');
  return `<div class="setup"><div class="mhead"><button class="btn small ghost" data-act="toMenu">← Quitter</button><h2>Salon de la partie</h2></div>
  ${info.erreur ? `<p class="warn">${esc(info.erreur)}</p>` : ''}
  <div class="salon"><div class="codebox"><div class="muted">Sur chaque téléphone : ouvre la page du jeu, « Rejoindre », puis saisis le code</div><div class="code">${info.code || '…'}</div><div class="qr">${info.qr || ''}</div>
  <div class="small muted">${esc(info.url || '')}</div></div>
  <div class="seatlist">${lignes}</div></div>
  <details class="manuel"><summary>Connexion manuelle (secours si le code ne fonctionne pas)</summary>
   <p class="small muted">Sur l'iPad : « Créer une invitation » puis copie le texte vers le téléphone (message, AirDrop…). Sur le téléphone : « Rejoindre » → « Connexion manuelle », colle l'invitation, copie la réponse et colle-la ici.</p>
   <button class="btn small" data-act="manuelOffre">Créer une invitation</button>
   <textarea id="manOffre" readonly placeholder="Invitation à copier vers le téléphone"></textarea>
   <button class="btn small ghost" data-act="copyOffre">Copier</button>
   <textarea id="manRep" placeholder="Colle ici la réponse du téléphone"></textarea>
   <button class="btn small" data-act="manuelRep">Valider la réponse</button>
  </details>
  <div class="mfoot"><button class="btn primary big" data-act="launchTel"${info.pret ? '' : ' disabled'}>Lancer la partie</button></div></div>`;
}

export function rejoindreHTML(info) {
  // info : { etape: 'code'|'choix'|'attente', code, seats, erreur, manuel }
  let corps = '';
  if (info.etape === 'code') {
    corps = `<p class="muted">Saisis le code à 4 chiffres affiché sur l'iPad.</p>
    <input id="codeInp" class="codeinp" inputmode="numeric" maxlength="4" value="${esc(info.code || '')}" placeholder="0000">
    <button class="btn primary big" data-act="doJoin">Se connecter</button>
    <details class="manuel"><summary>Connexion manuelle (secours)</summary>
      <p class="small muted">Colle ici l'invitation reçue de l'iPad :</p>
      <textarea id="manOffre" placeholder="Invitation de l'iPad"></textarea>
      <button class="btn small" data-act="manuelJoin">Générer la réponse</button>
      <textarea id="manRep" readonly placeholder="Réponse à copier vers l'iPad"></textarea>
      <button class="btn small ghost" data-act="copyRep">Copier</button>
    </details>`;
  } else if (info.etape === 'choix') {
    corps = `<p class="muted">Qui es-tu ?</p><div class="seatlist">${info.seats.map((s) => `<button class="seatrow pick" data-act="claim" data-id="${s.id}"${s.etat === 'pris' ? ' disabled' : ''}><span class="dot big" style="background:${s.couleur}"></span><b>${esc(s.nom)}</b><span class="etat ${s.etat}">${s.etat === 'pris' ? 'déjà pris' : 'libre'}</span></button>`).join('')}</div>`;
  } else {
    corps = `<div class="center"><div class="spinner"></div><p>Connecté. En attente du lancement de la partie…</p></div>`;
  }
  return `<div class="setup"><div class="mhead"><button class="btn small ghost" data-act="toMenu">← Menu</button><h2>Rejoindre une partie</h2></div>${info.erreur ? `<p class="warn">${esc(info.erreur)}</p>` : ''}${corps}</div>`;
}

// ---------- Liste des joueurs ----------
export function rosterHTML(view) {
  const li = view.players.map((p) => {
    const su = SUSPECT_PAR_ID[p.id];
    const actif = view.actor === p.id && view.phase !== 'over';
    return `<li class="${actif ? 'actif' : ''}${p.eliminated ? ' out' : ''}"><span class="dot" style="background:${su.couleur}"></span><span class="rn">${esc(p.nom)}</span>${p.kind === 'ia' ? '<span class="tag">🤖</span>' : ''}<span class="rc">🃏 ${p.handSize}</span>${p.eliminated ? '<span class="tag">éliminé</span>' : ''}</li>`;
  }).join('');
  return `<ul class="roster">${li}</ul>`;
}
