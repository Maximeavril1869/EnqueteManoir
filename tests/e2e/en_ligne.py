"""Mode « En ligne » d'EnqueteManoir : deux appareils simulés (deux contextes Chromium), faux serveur Supabase en mémoire.

Aucun réseau réel, aucun vrai compte : e-mails, mots de passe et prénoms inventés.
Couvre aussi le plateau (iPad en affichage seul), une partie à deux appareils et la partie solo.
Lancer depuis la racine du dépôt :  PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e/en_ligne.py
"""
import functools
import http.server
import json
import pathlib
import random
import sys
import threading
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
HOST = 'https://zoyrclsppuhgnyzgodjv.supabase.co'
ACCOUNTS = {'max@example.com': ('mot-de-passe-1', 'uid-max'), 'claire@example.com': ('mot-de-passe-2', 'uid-claire'), 'intrus@example.com': ('mot-de-passe-3', 'uid-intrus')}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, prefer',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS'}
RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    print(('  OK   ' if ok else '  ECHEC ') + name + ('' if ok else '  -> ' + str(detail)[:300]))


class Faux:
    def __init__(self):
        self.rows = {}
        self.offline = False
        self.cut = set()      # contextes dont le réseau est coupé
        self.stale = {}       # contexte -> version « figée » renvoyée au sondage (simule un retard réseau)
        self.n = 0
        self.tokens = {}      # jeton d'accès -> uid
        self.refresh = {}     # jeton de renouvellement -> (email, uid)
        self.conflicts = 0
        self.patches = 0

    def reply(self, route, status, body=None):
        route.fulfill(status=status, headers=CORS, content_type='application/json', body=json.dumps(body) if body is not None else '')

    def new_tokens(self, email, uid):
        self.n += 1
        at, rt = 'AT%d' % self.n, 'RT%d' % self.n
        self.tokens[at] = uid
        self.refresh[rt] = (email, uid)
        return {'access_token': at, 'refresh_token': rt, 'expires_in': 3600, 'user': {'id': uid, 'email': email}}

    def handle(self, route, ctx=None):
        req = route.request
        u = urlparse(req.url)
        q = parse_qs(u.query)
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers=CORS)
            return
        if self.offline or (ctx is not None and ctx in self.cut):
            route.abort()
            return
        if ctx is not None and ctx in self.stale and u.path == '/rest/v1/parties' and req.method == 'GET' and q.get('select') == ['version']:
            self.reply(route, 200, [{'version': self.stale[ctx]}])
            return
        if u.path == '/auth/v1/token':
            body = json.loads(req.post_data or '{}')
            if q.get('grant_type') == ['password']:
                acc = ACCOUNTS.get(body.get('email'))
                if acc and acc[0] == body.get('password'):
                    self.reply(route, 200, self.new_tokens(body['email'], acc[1]))
                else:
                    self.reply(route, 400, {'error_description': 'Invalid login credentials'})
            else:
                r = self.refresh.pop(body.get('refresh_token'), None)
                self.reply(route, 200, self.new_tokens(*r)) if r else self.reply(route, 400, {'error_description': 'Invalid Refresh Token'})
            return
        if u.path == '/rest/v1/parties':
            auth = req.headers.get('authorization', '')
            if not auth.startswith('Bearer ') or auth[7:] not in self.tokens:
                self.reply(route, 401, {'message': 'JWT expired'})
                return
            flt = {k: v[0][3:] for k, v in q.items() if k in ('id', 'jeu', 'version') and v[0].startswith('eq.')}
            match = [r for r in self.rows.values() if all(str(r[k]) == v for k, v in flt.items())]
            if req.method == 'GET':
                cols = q.get('select', ['*'])[0].split(',')
                if q.get('order') == ['maj.desc']:
                    match.sort(key=lambda r: r['maj'], reverse=True)
                out = [r if cols == ['*'] else {c: r[c] for c in cols} for r in match[:int(q.get('limit', ['100'])[0])]]
                self.reply(route, 200, out)
            elif req.method == 'POST':
                it = json.loads(req.post_data)
                if it['id'] in self.rows:
                    self.reply(route, 409, {'code': '23505'})
                else:
                    self.rows[it['id']] = {'id': it['id'], 'jeu': it['jeu'], 'titre': it.get('titre'), 'etat': it['etat'], 'version': it['version'], 'maj': it['maj']}
                    self.reply(route, 201)
            elif req.method == 'PATCH':
                self.patches += 1
                body = json.loads(req.post_data)
                if not match:
                    self.conflicts += 1
                for r in match:
                    r.update({k: body[k] for k in ('etat', 'version', 'maj', 'titre') if k in body})
                self.reply(route, 200, match)
            elif req.method == 'DELETE':
                for r in match:
                    del self.rows[r['id']]
                self.reply(route, 204)
            return
        route.continue_()


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/index.html' % srv.server_address[1]


def device(browser, faux, url, poll=150, viewport=None):
    ctx = browser.new_context(viewport=viewport or {'width': 390, 'height': 844})
    ctx.route(HOST + '/**', (lambda c: (lambda route: faux.handle(route, c)))(ctx))
    pg = ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.add_init_script('window.BOT_DELAY=5; window.EL_OPTIONS={poll:%d}; window.PLATEAU_POLL=250; window.PLATEAU_BEAT=300; window.PLATEAU_FRESH=1500;' % poll)
    pg.goto(url)
    return pg


def wait_for(fn, timeout=8000, step=40, pg=None):
    waited = 0
    while waited < timeout:
        if fn():
            return True
        if pg:
            pg.wait_for_timeout(step)
        waited += step
    return False


def login(pg, email):
    pg.click('[data-act="toOnline"]')
    pg.fill('#olEmail', email)
    pg.fill('#olPwd', ACCOUNTS[email][0])
    pg.click('[data-act="olLogin"]')
    pg.wait_for_selector('[data-act="olJoin"]')


def acteur(st):
    if st['phase'] == 'over':
        return None
    return st['pending']['refuter'] if st['phase'] == 'refuting' else st['order'][st['turnIdx']]


def joueur(st, pid):
    return next(p for p in st['players'] if p['id'] == pid)


def agir(pg, st):
    """Joue UN coup au hasard pour l'appareil pg (c'est son tour). Rend True si un geste a été fait."""
    ph = st['phase']
    try:
        def clic(sel):
            loc = pg.locator(sel)
            if loc.count():
                loc.first.click(timeout=2000)
                return True
            return False
        if ph == 'start':
            return clic('.actions [data-act="roll"]')
        if ph == 'moving':
            if pg.locator('.actions [data-act="moveRoom"]').count():
                return clic('.actions [data-act="moveRoom"]')
            return pg.evaluate("""() => { const e = document.querySelector('svg.board [data-act="moveCell"]');
                if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }""")
        if ph == 'act':
            if pg.locator('.actions [data-act="openSuggest"]').count():
                pg.click('.actions [data-act="openSuggest"]', timeout=2000)
                pg.click('.opt[data-type="s"] >> nth=%d' % random.randrange(6), timeout=2000)
                pg.click('.opt[data-type="a"] >> nth=%d' % random.randrange(6), timeout=2000)
                pg.click('[data-act="doSuggest"]', timeout=2000)
                return True
            return clic('.actions [data-act="end"]')
        if ph == 'refuting':
            return clic('.actions [data-act="show"]')
        if ph == 'after':
            return clic('.actions [data-act="end"]')
    except Exception:
        return False
    return False


def accuser_juste(pg, st):
    e = st['envelope']
    pg.click('.actions [data-act="openAccuse"]', timeout=3000)
    for t in ('s', 'a', 'p'):
        pg.click('.opt[data-card="%s"]' % e[t], timeout=3000)
    pg.click('[data-act="doAccuse"]', timeout=3000)


def jouer(faux, gid, pages, seats, budget=40, stop=None):
    """Fait jouer les humains (un geste à chaque fois que c'est leur tour) ; les ordinateurs sont joués par l'hôte."""
    for _ in range(budget * 25):
        st = state(faux, gid)
        if st['phase'] == 'over' or (stop and stop(st)):
            return st
        a = acteur(st)
        if a in seats:
            pg = pages[seats.index(a)]
            v0 = faux.rows[gid]['version']
            if agir(pg, st):
                wait_for(lambda: faux.rows[gid]['version'] > v0, 3000, pg=pg)
        else:
            pages[0].wait_for_timeout(60)
    return state(faux, gid)


def state(faux, id_):
    return faux.rows[id_]['etat']


def main():
    random.seed(7)
    srv, url = serve()
    faux = Faux()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        host = device(browser, faux, url)
        guest = device(browser, faux, url)

        # ---------- Menu : anciens modes supprimés ----------
        txt = host.inner_text('body')
        check('menu : plus de passe-passe, face à face ni téléphones', not any(w in txt for w in ('Passe-passe', 'Face à face', 'Rejoindre une partie (téléphone)')), txt)
        check('plus de PeerJS ni de QR code', host.evaluate("() => typeof Peer === 'undefined' && typeof qrcode === 'undefined'"))
        check('menu : partie solo et En ligne proposés', 'Partie solo' in txt and 'En ligne' in txt)

        # ---------- Création / rejoindre ----------
        login(host, 'max@example.com')
        host.click('[data-act="toSetup"][data-mode="online"]')
        check('réglage en ligne : rôles Moi / Invité / Ordi', host.locator('[data-act="setRole"][data-v="invite"]').count() == 6)
        host.click('[data-act="startGame"]')
        host.wait_for_selector('.code')
        code = host.inner_text('.code').strip()
        check('salle d’attente : code à 4 lettres', len(code) == 4, code)
        row = faux.rows.get(code)
        check('la ligne existe, jeu « enquetemanoir », en attente', row and row['jeu'] == 'enquetemanoir' and row['etat']['online']['joined'] is False)
        seats = row['etat']['online']['seats']
        check('hôte = Corail, invité = Safran, Sauge est un ordinateur', seats == ['corail', 'safran'] and joueur(row['etat'], 'sauge')['kind'] == 'ia')

        login(guest, 'claire@example.com')
        guest.fill('#codeInp', code.lower())
        guest.fill('#nomInp', 'Claire')
        guest.click('[data-act="olJoin"]')
        guest.wait_for_selector('.phone')
        host.wait_for_selector('.phone')
        st = state(faux, code)
        check('l’invité rejoint : 2 identifiants, nom saisi', st['online']['joined'] and st['online']['uids'] == ['uid-max', 'uid-claire'] and joueur(st, 'safran')['nom'] == 'Claire', st['online'])
        check('hôte : sort de l’attente quand l’invité arrive', host.locator('.phone').count() == 1)

        # ---------- Affichage sans plateau ----------
        check('sans plateau : table (plateau de jeu) visible sur les deux téléphones', host.locator('.fitboard svg').count() == 1 and guest.locator('.fitboard svg').count() == 1)
        for nom, pg, pid in (('hôte', host, 'corail'), ('invité', guest, 'safran')):
            main_ = joueur(st, pid)['hand']
            check(nom + ' : ne voit que SES cartes (%d)' % len(main_), pg.locator('.hand .chip').count() == len(main_))
        noms = lambda pid, ids=None: host.evaluate("""async ([pid, ids]) => { const d = await import('./js/data.js');
            const st = __app.state; const l = ids || st.players.find((p) => p.id === pid).hand; return l.map((c) => d.nomCarte(c)); }""", [pid, ids])
        txt_main = host.inner_text('.hand')
        check('hôte : aucune carte de l’invité ni du dossier dans sa main affichée',
              not any(n in host.locator('.hand .chip').all_inner_texts() for n in noms('safran')) and not any(any(n in t for t in host.locator('.hand .chip').all_inner_texts()) for n in noms(None, list(st['envelope'].values()))), txt_main)

        # ---------- Conflit : l'hôte joue alors que l'état a bougé ----------
        ctx_h = host.context
        v0 = faux.rows[code]['version']
        faux.stale[ctx_h] = v0
        faux.rows[code]['version'] = v0 + 1       # « l'autre appareil » a écrit entre-temps
        c0 = faux.conflicts
        host.click('.actions [data-act="roll"]')
        check('conflit détecté par le serveur (écriture refusée)', wait_for(lambda: faux.conflicts > c0, 4000, pg=host))
        check('conflit : l’action de l’hôte est annulée (dés non lancés) et le serveur garde son état', wait_for(lambda: host.evaluate("() => __app.state.dice === null"), 4000, pg=host) and state(faux, code)['dice'] is None)
        check('conflit : message « Ton action a été annulée »', 'annulée' in host.evaluate("() => document.getElementById('toast').textContent"))
        del faux.stale[ctx_h]

        # ---------- Plateau (iPad) ----------
        ipad = device(browser, faux, url, viewport={'width': 1180, 'height': 820})
        login(ipad, 'max@example.com')
        patches_avant = faux.patches
        ver_partie = faux.rows[code]['version']
        ipad.fill('#platInp', code)
        ipad.click('[data-act="platStart"]')
        ipad.wait_for_selector('.game.plateau')
        check('plateau : affiche la table commune (plateau de jeu + joueurs + suggestions)', ipad.locator('.plateau svg.board').count() == 1 and ipad.locator('.roster li').count() == 3 and 'Suggestions' in ipad.inner_text('.plateau'))
        check('plateau : aucune main ni bouton d’action (lecture seule)', ipad.locator('.hand, .cards, .actions, [data-act="roll"], [data-act="openAccuse"]').count() == 0)
        ipad.wait_for_timeout(1200)
        plate_rows = [r for r in faux.rows.values() if r['jeu'] == 'plateau']
        check('plateau : signe de vie dans sa propre ligne (jeu « plateau », titre = code)', len(plate_rows) == 1 and plate_rows[0]['titre'] == code)
        check('plateau : n’écrit jamais dans la ligne de la partie', faux.rows[code]['version'] == ver_partie)
        check('téléphones : table masquée dès que le plateau est détecté', wait_for(lambda: host.locator('.tablebar').count() == 1 and guest.locator('.tablebar').count() == 1, 6000, pg=host) and host.locator('.fitboard, .roster').count() == 0 and guest.locator('.fitboard, .roster').count() == 0)
        check('téléphones : main, carnet et boutons restent là', host.locator('.hand .chip').count() > 0 and host.locator('[data-act="openCarnet"]').count() == 1)
        host.click('[data-act="toggleTable"]')
        check('bouton « Afficher la table » : la table revient', host.locator('.fitboard svg').count() == 1 and host.locator('.roster').count() == 1)
        host.click('[data-act="toggleTable"]')
        check('bouton « Masquer la table » : elle se recache', host.locator('.fitboard').count() == 0)

        # ---------- Partie à deux, avec plateau ----------
        faux.stale.pop(ctx_h, None)
        st = jouer(faux, code, [host, guest], seats, budget=14, stop=lambda s: s['turnCount'] >= 9)
        check('la partie avance (au moins 9 tours, ordinateur Sauge compris)', st['turnCount'] >= 9, st['turnCount'])
        check('l’ordinateur a joué (hôte seul)', any('Sauge' in l['txt'] and ('suggère' in l['txt'] or 'dés' in l['txt']) for l in st['log']))
        ok_moving = False
        for _ in range(200):
            st = state(faux, code)
            a = acteur(st)
            if st['phase'] == 'moving' and a in seats:
                pg = [host, guest][seats.index(a)]
                ok_moving = wait_for(lambda: pg.locator('.miniboard svg').count() == 1, 3000, pg=pg)
                break
            if a in seats:
                agir([host, guest][seats.index(a)], st)
            host.wait_for_timeout(60)
        check('avec plateau : le mini-plateau réapparaît seulement pour choisir sa case', ok_moving)
        check('privé : la carte montrée en secret n’apparaît que dans le journal du destinataire', all(('vous montre' not in l['txt']) or l.get('to') for l in state(faux, code)['log']))
        v_ipad = ipad.inner_text('.plateau')
        check('plateau : le journal public n’affiche aucune carte montrée en secret', 'vous montre' not in v_ipad)
        check('plateau suit la partie (dernier tour affiché)', wait_for(lambda: ('Au tour de' in ipad.inner_text('.plateau .banner') or 'réfléchit' in ipad.inner_text('.plateau .banner') or 'choisit' in ipad.inner_text('.plateau .banner')), 3000, pg=ipad))

        # ---------- Plateau coupé : la table revient ----------
        ipad.click('[data-act="toMenu"]')
        check('quitter le plateau supprime sa ligne', wait_for(lambda: not [r for r in faux.rows.values() if r['jeu'] == 'plateau'], 3000, pg=ipad))
        check('téléphones : la table réapparaît seule', wait_for(lambda: host.locator('.tablebar').count() == 0 and host.locator('.fitboard svg, .miniboard svg').count() == 1, 8000, pg=host))

        # ---------- Réseau coupé / reprise ----------
        faux.cut.add(ctx_h)
        check('réseau coupé : bandeau « Hors ligne » sur l’hôte', wait_for(lambda: host.locator('.offbar').count() == 1, 6000, pg=host))
        faux.cut.discard(ctx_h)
        check('réseau revenu : bandeau retiré', wait_for(lambda: host.locator('.offbar').count() == 0, 6000, pg=host))

        # ---------- Rechargement de l'invité : reprise de la même place ----------
        guest.reload()
        guest.click('[data-act="toOnline"]')
        guest.wait_for_selector('[data-act="olResume"]')
        guest.click('[data-act="olResume"]')
        guest.wait_for_selector('.phone')
        check('reprise : l’invité retrouve sa place (Safran) et ses cartes', guest.locator('.hand .chip').count() == len(joueur(state(faux, code), 'safran')['hand']))

        # ---------- Intrus ----------
        intrus = device(browser, faux, url)
        login(intrus, 'intrus@example.com')
        intrus.fill('#codeInp', code)
        intrus.click('[data-act="olJoin"]')
        check('un troisième joueur est refusé', wait_for(lambda: 'deux joueurs' in intrus.inner_text('body'), 4000, pg=intrus))
        intrus.fill('#codeInp', 'ZZZZ')
        intrus.click('[data-act="olJoin"]')
        check('code inconnu signalé', wait_for(lambda: 'Code inconnu' in intrus.inner_text('body'), 4000, pg=intrus))

        # ---------- Fin de partie par accusation exacte, puis Rejouer ----------
        for _ in range(300):
            st = state(faux, code)
            a = acteur(st)
            if a == 'safran' and st['phase'] in ('start', 'act', 'after'):
                break
            if a in seats:
                agir([host, guest][seats.index(a)], st)
            host.wait_for_timeout(60)
        st = state(faux, code)
        accuser_juste(guest, st)
        check('accusation exacte : fin de partie sur les deux appareils', wait_for(lambda: host.locator('.overlay h2').count() and 'résout' in host.inner_text('.overlay') and 'résout' in guest.inner_text('.overlay'), 6000, pg=host))
        check('fin : la solution est révélée à la fin seulement', state(faux, code)['solution'] is not None and state(faux, code)['winner'] == 'safran')
        gid0 = state(faux, code)['gameId']
        host.click('[data-act="closeModal"]')
        guest.click('[data-act="replay"]')
        check('Rejouer : même code, nouveau dossier, nouvelle donne des cartes', wait_for(lambda: state(faux, code)['gameId'] != gid0 and state(faux, code)['phase'] != 'over', 5000, pg=guest))
        check('Rejouer : l’hôte repart aussi (écran de fin fermé, partie en cours)', wait_for(lambda: host.locator('.overlay').count() == 0 and host.locator('.hand .chip').count() > 0, 6000, pg=host))

        # ---------- Suppression ----------
        host.click('[data-act="toMenu"]')
        host.click('[data-act="toOnline"]')
        host.wait_for_selector('[data-act="olDel"]')
        host.click('[data-act="olDel"]')
        check('suppression : la ligne disparaît', wait_for(lambda: code not in faux.rows, 4000, pg=host))
        check('suppression : l’invité est renvoyé au menu avec un message', wait_for(lambda: 'supprimée' in guest.inner_text('body'), 6000, pg=guest))

        check('aucune erreur JavaScript (hôte)', not host.errors, host.errors)
        check('aucune erreur JavaScript (invité)', not guest.errors, guest.errors)
        check('aucune erreur JavaScript (plateau)', not ipad.errors, ipad.errors)

        # ---------- Solo ----------
        s = device(browser, faux, url)
        patches0 = faux.patches
        rows0 = dict((k, v['version']) for k, v in faux.rows.items())
        s.click('[data-act="toSetup"][data-mode="solo"]')
        check('solo : pas de rôle « Invité »', s.locator('[data-act="setRole"][data-v="invite"]').count() == 0)
        s.click('[data-act="startGame"]')
        s.wait_for_selector('.game')
        check('solo : plateau, main et boutons à l’écran', s.locator('svg.board').count() == 1 and s.locator('.hand .chip').count() > 0 and s.locator('.actions [data-act="roll"]').count() == 1)
        for _ in range(200):
            a = s.evaluate("() => { const st = __app.state; return st.phase === 'refuting' ? st.pending.refuter : st.order[st.turnIdx]; }")
            ph = s.evaluate("() => __app.state.phase")
            if a == 'corail':
                st_ = s.evaluate("() => __app.state")
                agir(s, st_)
            s.wait_for_timeout(40)
            if s.evaluate("() => __app.state.turnCount") >= 6:
                break
        tc = s.evaluate("() => __app.state.turnCount")
        check('solo : la partie avance contre les ordinateurs', tc >= 6, tc)
        s.reload()
        s.wait_for_selector('[data-act="resume"]')
        s.click('[data-act="resume"]')
        s.wait_for_selector('.game')
        check('solo : reprise de la partie sauvegardée', s.evaluate("() => __app.state.turnCount") >= tc)
        check('solo : aucune écriture sur le serveur', faux.patches == patches0 and dict((k, v['version']) for k, v in faux.rows.items()) == rows0)
        check('aucune erreur JavaScript (solo)', not s.errors, s.errors)

        sw = (ROOT / 'sw.js').read_text()
        check('le service worker ne met jamais en cache les requêtes vers un autre site', 'origin !== location.origin' in sw and 'en-ligne.js' in sw and 'peerjs' not in sw)
        browser.close()
    failed = [n for n, ok in RESULTS if not ok]
    print('\n%d vérifications, %d échec(s)' % (len(RESULTS), len(failed)))
    for n in failed:
        print('  ECHEC : ' + n)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
