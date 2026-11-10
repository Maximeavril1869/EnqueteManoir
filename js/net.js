// Mode téléphones : l'iPad est l'hôte (il détient la partie), chaque téléphone reçoit uniquement sa propre vue.
// Transport : WebRTC (données directes entre appareils). Le courtier public PeerJS ne sert qu'à échanger les
// coordonnées de connexion via un code à 4 chiffres. Secours : échange manuel de texte (sans aucun serveur).

export const PREFIXE = 'enquetemanoir-';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ----- Adaptateurs : tout transport devient { send(obj), close(), onmessage, onclose } -----
function adapterPeerJS(dc) {
  const c = { send: (o) => dc.send(JSON.stringify(o)), close: () => dc.close(), onmessage: null, onclose: null };
  dc.on('data', (d) => c.onmessage && c.onmessage(typeof d === 'string' ? JSON.parse(d) : d));
  dc.on('close', () => c.onclose && c.onclose());
  dc.on('error', () => c.onclose && c.onclose());
  return c;
}
function adapterCanal(dc) {
  const c = { send: (o) => dc.send(JSON.stringify(o)), close: () => dc.close(), onmessage: null, onclose: null };
  dc.onmessage = (e) => c.onmessage && c.onmessage(JSON.parse(e.data));
  dc.onclose = () => c.onclose && c.onclose();
  dc.onerror = () => c.onclose && c.onclose();
  return c;
}
const b64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const unb64 = (txt) => JSON.parse(decodeURIComponent(escape(atob(txt.trim()))));

function attendreIce(pc, ms = 3000) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const fin = () => {
      pc.removeEventListener('icegatheringstatechange', ch);
      res();
    };
    const ch = () => pc.iceGatheringState === 'complete' && fin();
    pc.addEventListener('icegatheringstatechange', ch);
    setTimeout(fin, ms);
  });
}

// ===================== Hôte =====================
export class SalonHote {
  // seats : [{ id, nom, couleur }] — les places réservées aux téléphones.
  constructor(seats, rappels) {
    this.seats = seats;
    this.etat = Object.fromEntries(seats.map((s) => [s.id, 'libre'])); // libre | pris | coupe
    this.conns = {}; // pid -> conn
    this.orphelines = new Set();
    this.rappels = rappels; // { change(), action(action), erreur(msg) }
    this.peer = null;
    this.code = null;
    this.demarre = false;
    this.getVue = null;
    this.manuels = [];
  }

  listeSeats() {
    return this.seats.map((s) => ({ ...s, etat: this.etat[s.id] }));
  }
  pret() {
    return this.seats.every((s) => this.etat[s.id] === 'pris');
  }

  async ouvrir() {
    if (typeof Peer === 'undefined') throw new Error('Bibliothèque de connexion indisponible.');
    for (let essai = 0; essai < 6; essai++) {
      const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      try {
        await new Promise((resolve, reject) => {
          const peer = new Peer(PREFIXE + code, { config: ICE });
          const t = setTimeout(() => reject(new Error('Le courtier de connexion ne répond pas (internet ?).')), 10000);
          peer.on('open', () => {
            clearTimeout(t);
            this.peer = peer;
            this.code = code;
            resolve();
          });
          peer.on('error', (e) => {
            clearTimeout(t);
            reject(e);
          });
        });
        this.peer.on('connection', (dc) => {
          const conn = adapterPeerJS(dc);
          const go = () => this.attacher(conn);
          if (dc.open) go();
          else dc.on('open', go);
        });
        this.peer.on('error', (e) => this.rappels.erreur && this.rappels.erreur('le courtier de connexion a signalé un problème (' + String((e && e.type) || e) + ').'));
        return this.code;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        if (e instanceof Error && !e.type) throw e;
        throw new Error('Le courtier de connexion est injoignable (internet absent ou réseau filtré).');
      }
    }
    throw new Error("Impossible d'obtenir un code libre.");
  }

  // Appelé pour chaque nouvelle connexion (PeerJS, manuelle, ou factice dans les tests).
  attacher(conn) {
    this.orphelines.add(conn);
    conn.onmessage = (m) => this.recevoir(conn, m);
    conn.onclose = () => {
      this.orphelines.delete(conn);
      for (const [pid, c] of Object.entries(this.conns)) {
        if (c === conn) {
          delete this.conns[pid];
          this.etat[pid] = 'coupe';
          this.rappels.change && this.rappels.change();
        }
      }
    };
    conn.send({ t: 'salon', seats: this.listeSeats(), demarre: this.demarre });
  }

  recevoir(conn, m) {
    if (m.t === 'claim') {
      const s = this.seats.find((x) => x.id === m.pid);
      if (!s) return conn.send({ t: 'err', msg: 'Place inconnue.' });
      if (this.etat[s.id] === 'pris') return conn.send({ t: 'err', msg: 'Place déjà prise.' });
      this.conns[s.id] = conn;
      this.etat[s.id] = 'pris';
      this.orphelines.delete(conn);
      conn.send({ t: 'claimed', pid: s.id, demarre: this.demarre });
      this.diffuserSalon();
      this.rappels.change && this.rappels.change();
      if (this.demarre && this.getVue) conn.send({ t: 'view', view: this.getVue(s.id) });
    } else if (m.t === 'act') {
      const pid = Object.keys(this.conns).find((k) => this.conns[k] === conn);
      if (!pid) return;
      this.rappels.action && this.rappels.action({ ...m.action, by: pid });
    }
  }

  diffuserSalon() {
    const msg = { t: 'salon', seats: this.listeSeats(), demarre: this.demarre };
    for (const c of this.orphelines) c.send(msg);
  }

  lancer(getVue) {
    this.demarre = true;
    this.getVue = getVue;
    this.envoyerVues();
  }

  envoyerVues() {
    if (!this.demarre) return;
    for (const [pid, c] of Object.entries(this.conns)) c.send({ t: 'view', view: this.getVue(pid) });
  }

  // ----- Secours manuel (sans courtier) -----
  async creerInvitation() {
    const pc = new RTCPeerConnection(ICE);
    const dc = pc.createDataChannel('em');
    await pc.setLocalDescription(await pc.createOffer());
    await attendreIce(pc);
    const manuel = { pc, dc };
    this.manuels.push(manuel);
    dc.onopen = () => this.attacher(adapterCanal(dc));
    return { texte: b64(pc.localDescription), manuel };
  }
  async validerReponse(manuel, texte) {
    await manuel.pc.setRemoteDescription(unb64(texte));
  }
  fermer() {
    try { this.peer && this.peer.destroy(); } catch (e) { /* ignoré */ }
    for (const c of Object.values(this.conns)) try { c.close(); } catch (e) { /* ignoré */ }
  }
}

// ===================== Client (téléphone) =====================
export class ClientTel {
  // rappels : { salon(seats), claimed(pid), vue(view), erreur(msg), coupe() }
  constructor(rappels) {
    this.rappels = rappels;
    this.conn = null;
    this.peer = null;
    this.pid = null;
  }

  async connecter(code) {
    if (typeof Peer === 'undefined') throw new Error('Bibliothèque de connexion indisponible.');
    await new Promise((resolve, reject) => {
      const peer = new Peer({ config: ICE });
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('Connexion impossible : vérifie le code et le wifi.')), 12000);
      peer.on('error', (e) => {
        clearTimeout(t);
        reject(new Error(e && e.type === 'peer-unavailable' ? 'Code inconnu. Vérifie-le sur l’iPad.' : 'Erreur de connexion (' + (e.type || e) + ').'));
      });
      peer.on('open', () => {
        const dc = peer.connect(PREFIXE + code, { reliable: true });
        dc.on('open', () => {
          clearTimeout(t);
          this.attacher(adapterPeerJS(dc));
          resolve();
        });
      });
    });
  }

  attacher(conn) {
    this.conn = conn;
    conn.onmessage = (m) => {
      if (m.t === 'salon') this.rappels.salon && this.rappels.salon(m.seats, m.demarre);
      else if (m.t === 'claimed') {
        this.pid = m.pid;
        this.rappels.claimed && this.rappels.claimed(m.pid);
      } else if (m.t === 'view') this.rappels.vue && this.rappels.vue(m.view);
      else if (m.t === 'err') this.rappels.erreur && this.rappels.erreur(m.msg);
    };
    conn.onclose = () => this.rappels.coupe && this.rappels.coupe();
  }

  choisir(pid) {
    this.conn.send({ t: 'claim', pid });
  }
  agir(action) {
    this.conn.send({ t: 'act', action });
  }

  // ----- Secours manuel -----
  async repondreInvitation(texte) {
    const pc = new RTCPeerConnection(ICE);
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      const go = () => this.attacher(adapterCanal(dc));
      if (dc.readyState === 'open') go();
      else dc.onopen = go;
    };
    await pc.setRemoteDescription(unb64(texte));
    await pc.setLocalDescription(await pc.createAnswer());
    await attendreIce(pc);
    this.pc = pc;
    return b64(pc.localDescription);
  }
}
