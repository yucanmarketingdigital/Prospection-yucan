// Script injecté dans les pages LinkedIn.
// 1. Exécute les actions demandées par le moteur (lire un profil, inviter, envoyer un message).
// 2. Ajoute un bouton « Importer » sur les pages de recherche et de profil (envoi vers l'application Yucan).
// LinkedIn modifie souvent sa page : les sélecteurs ci-dessous sont volontairement larges
// (libellés en français et en anglais) et regroupés ici pour être faciles à corriger.
(() => {
  if (window.__prospectionIA) return;
  window.__prospectionIA = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  async function waitFor(fn, timeout = 10000, every = 300) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch {
        /* on réessaie */
      }
      await sleep(every);
    }
    return null;
  }

  function normalizeUrl(u) {
    const m = String(u || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
    return m ? `https://www.linkedin.com/in/${m[1].toLowerCase()}/` : null;
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findButton(regex, root = document) {
    if (!root) return null;
    const els = root.querySelectorAll('button, a[role="button"], div[role="button"], a[href*="/preload/custom-invite"]');
    for (const el of els) {
      const label = el.getAttribute('aria-label') || '';
      const text = norm(el.innerText);
      if ((regex.test(label) || regex.test(text)) && isVisible(el)) return el;
    }
    return null;
  }

  async function humanClick(el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(rand(400, 900));
    el.click();
  }

  async function humanScroll() {
    for (let i = 0; i < 3; i++) {
      window.scrollBy({ top: rand(300, 700), behavior: 'smooth' });
      await sleep(rand(700, 1500));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await sleep(rand(500, 1000));
  }

  // ---------- Lecture du profil ----------

  function topCard() {
    const h1 = document.querySelector('main h1');
    return (h1 && h1.closest('section')) || document.querySelector('main section') || document.body;
  }

  function sectionText(id, max) {
    const anchor = document.getElementById(id);
    const sec = anchor && anchor.closest('section');
    if (!sec) return '';
    const parts = [];
    for (const s of sec.querySelectorAll('span[aria-hidden="true"]')) {
      const t = norm(s.innerText);
      if (t && parts[parts.length - 1] !== t) parts.push(t);
    }
    return parts.slice(1).join(' · ').slice(0, max); // on retire le titre de la section
  }

  function guessCompany(headline, experience) {
    const m = headline.match(/(?:\bchez\b|\bat\b|@)\s+([^|,·•–-]+)/i);
    if (m) return norm(m[1]);
    const parts = experience.split(' · ');
    return parts[1] ? norm(parts[1]) : '';
  }

  // Poste actuel : première ligne de la section Expérience (intitulé · entreprise · dates).
  function currentPosition() {
    const sec = document.getElementById('experience')?.closest('section');
    const li = sec?.querySelector('li');
    if (!li) return '';
    const parts = [];
    for (const s of li.querySelectorAll('span[aria-hidden="true"]')) {
      const t = norm(s.innerText);
      if (t && !parts.includes(t)) parts.push(t);
    }
    return parts.slice(0, 3).join(' · ').slice(0, 300);
  }

  // Derniers posts, lus sur la page « Activité > Posts » du profil.
  async function scrapePosts() {
    const SEL = '.feed-shared-update-v2, div[data-urn*="urn:li:activity"]';
    await waitFor(() => document.querySelector(SEL), 15000);
    await humanScroll();
    const posts = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (posts.length >= 3) break;
      const text = norm(el.querySelector('.update-components-text, .feed-shared-inline-show-more-text, .feed-shared-text')?.innerText)
        .replace(/…\s*(voir plus|plus|see more|more)$/i, '')
        .trim();
      if (!text || posts.some((p) => p.text === text.slice(0, 1500))) continue;
      const header = norm(el.querySelector('.update-components-header__text-view, .update-components-header')?.innerText);
      const date = norm(el.querySelector('.update-components-actor__sub-description, .feed-shared-actor__sub-description')?.innerText)
        .split('•')[0]
        .trim();
      posts.push({ date, text: text.slice(0, 1500), repost: /republi|repost/i.test(header) });
    }
    return { posts };
  }

  function scrapeProfile() {
    const card = topCard();
    const fullName = norm(document.querySelector('main h1')?.innerText);
    const headline = norm(card.querySelector('.text-body-medium')?.innerText);
    const place = norm(card.querySelector('.text-body-small.inline.t-black--light, span.text-body-small.t-black--light')?.innerText);
    const degree = norm(card.querySelector('.dist-value')?.innerText || '');
    const about = sectionText('about', 2000);
    const experience = sectionText('experience', 2500);
    const education = sectionText('education', 800);
    const position = currentPosition();
    const connected = /\b1(st|er)?\b/i.test(degree) && !/2|3/.test(degree);
    return {
      fullName,
      firstName: fullName.split(' ')[0] || '',
      lastName: fullName.split(' ').slice(1).join(' '),
      headline,
      company: guessCompany(headline, experience) || norm(position.split(' · ')[1] || ''),
      currentPosition: position,
      location: place,
      about,
      experience,
      education,
      degree,
      connected,
      url: normalizeUrl(window.location.href) || undefined,
    };
  }

  async function loadProfile() {
    const h1 = await waitFor(() => document.querySelector('main h1'), 20000);
    if (!h1) throw new Error("Profil introuvable sur la page (page non chargée ou profil inaccessible).");
    await sleep(rand(1500, 3000));
    await humanScroll();
    return scrapeProfile();
  }

  // ---------- Actions ----------

  const RE_PENDING = /en attente|pending|retirer l.invitation|withdraw/i;
  const RE_CONNECT = /^(se connecter|connect)$|invit\S* .*(rejoindre|réseau|se connecter)|invite .* to connect/i;
  const RE_MORE = /plus d.actions|more actions|^plus$|^more$/i;

  async function checkConnection() {
    const profile = await loadProfile();
    const card = topCard();
    return { profile, connected: profile.connected, pending: !!findButton(RE_PENDING, card) };
  }

  function setNativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function typeTextarea(el, text) {
    el.focus();
    let cur = '';
    for (const word of text.split(/(\s+)/)) {
      cur += word;
      setNativeValue(el, cur);
      await sleep(rand(20, 90));
    }
  }

  async function connect({ note }) {
    const profile = await loadProfile();
    if (profile.connected) return { status: 'already_connected', profile };
    const card = topCard();
    if (findButton(RE_PENDING, card)) return { status: 'pending', profile };

    let btn = findButton(RE_CONNECT, card);
    if (!btn) {
      const more = findButton(RE_MORE, card);
      if (more) {
        await humanClick(more);
        btn = await waitFor(() => findButton(RE_CONNECT, document), 4000);
      }
    }
    if (!btn) {
      return {
        status: 'error',
        profile,
        error: "Bouton « Se connecter » introuvable (profil en mode « Suivre », hors réseau, ou page LinkedIn modifiée).",
      };
    }
    await humanClick(btn);

    const dialog = await waitFor(() => document.querySelector('div[role="dialog"], div[role="alertdialog"]'), 8000);
    if (!dialog) {
      await sleep(1500);
      if (findButton(RE_PENDING, topCard())) return { status: 'sent', profile };
      return { status: 'error', profile, error: "La fenêtre d'invitation ne s'est pas ouverte." };
    }
    await sleep(rand(800, 1500));
    if (/adresse e-mail|email address/i.test(dialog.innerText)) {
      return { status: 'error', profile, error: "LinkedIn demande l'e-mail de la personne pour l'inviter." };
    }

    if (note) {
      const addNote = findButton(/ajouter une note|add a note/i, dialog);
      if (addNote) {
        await humanClick(addNote);
        const ta = await waitFor(() => document.querySelector('div[role="dialog"] textarea'), 5000);
        if (!ta) {
          return {
            status: 'error',
            profile,
            error: "Impossible d'ajouter une note (limite mensuelle des comptes gratuits ?). Passez l'invitation en « sans note ».",
          };
        }
        await typeTextarea(ta, note);
        await sleep(rand(600, 1200));
      }
    }

    const send = await waitFor(() => {
      const d = document.querySelector('div[role="dialog"]');
      const b = findButton(/^envoyer$|^send$|envoyer sans note|send without a note|envoyer l.invitation|send invitation|^send now$/i, d || document);
      return b && !b.disabled ? b : null;
    }, 6000);
    if (!send) return { status: 'error', profile, error: "Bouton « Envoyer » de l'invitation introuvable." };
    await humanClick(send);
    await sleep(rand(1500, 2500));
    return { status: 'sent', profile };
  }

  function lastVisible(nodes) {
    const list = [...nodes].filter(isVisible);
    return list[list.length - 1] || null;
  }

  function conversationRoot(box) {
    return box.closest('.msg-overlay-conversation-bubble, .msg-convo-wrapper, [class*="conversation"]') || document;
  }

  function hasReplied(root, fullName) {
    const first = norm(fullName).split(' ')[0]?.toLowerCase();
    if (!first) return false;
    const names = [...root.querySelectorAll('.msg-s-message-group__name, .msg-s-message-group__profile-link, .msg-s-event-listitem__name')]
      .map((e) => norm(e.innerText).toLowerCase())
      .filter(Boolean);
    return names.some((n) => n.split(' ')[0] === first);
  }

  async function closeConversation(root) {
    const close = findButton(/fermer votre conversation|close your conversation|fermer la conversation|^fermer$|^close$/i, root);
    if (close) close.click();
  }

  async function insertText(box, text) {
    box.focus();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const chunk of lines[i].match(/.{1,25}(\s|$)|.+/g) || []) {
        document.execCommand('insertText', false, chunk);
        await sleep(rand(40, 140));
      }
      if (i < lines.length - 1) document.execCommand('insertParagraph');
    }
    if (!norm(box.innerText)) {
      // Repli si la saisie simulée n'a pas fonctionné (onglet en arrière-plan).
      box.innerHTML = lines.map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '<br>'}</p>`).join('');
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  // Ajoute les fichiers au message via le champ « Joindre » de LinkedIn, puis attend la fin de l'envoi.
  async function attachFiles(root, attachments) {
    const files = attachments.map((a) => {
      const bin = atob(a.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], a.name, { type: a.type });
    });
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const inputs = [...root.querySelectorAll('input[type="file"]'), ...document.querySelectorAll('.msg-form input[type="file"]')];
      const input =
        inputs.find((i) => (isImage ? /image/.test(i.accept || '') : !/^image\/\*$/.test(i.accept || ''))) || inputs[0];
      if (!input) return "Bouton « Joindre un fichier » introuvable dans la conversation LinkedIn.";
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(rand(1500, 2500));
    }
    // Les vidéos et gros fichiers prennent plus de temps à être envoyés à LinkedIn.
    const big = files.some((f) => f.size > 3 * 1024 * 1024 || f.type.startsWith('video/'));
    const ready = await waitFor(() => {
      const uploading = root.querySelector('[class*="progress"], [role="progressbar"]');
      const b = root.querySelector('button.msg-form__send-button, button.msg-form__send-btn, button[type="submit"]');
      return !uploading && b && !b.disabled;
    }, big ? 90000 : 30000, 1000);
    if (!ready) return "La pièce jointe n'a pas pu être chargée dans LinkedIn (format refusé ou fichier trop lourd).";
    return null;
  }

  async function sendMessage({ text, fullName, attachments }) {
    const profile = await loadProfile();
    const btn = findButton(/^(envoyer un )?message\b/i, topCard());
    if (!btn) {
      return { status: 'error', profile, error: "Bouton « Message » introuvable (la personne n'est peut-être pas encore en relation)." };
    }
    await humanClick(btn);
    const box = await waitFor(
      () => lastVisible(document.querySelectorAll('.msg-form__contenteditable[contenteditable="true"], div[role="textbox"][contenteditable="true"]')),
      12000
    );
    if (!box) return { status: 'error', profile, error: 'Zone de message introuvable.' };
    await sleep(rand(2000, 3500)); // laisse charger l'historique de la conversation
    const root = conversationRoot(box);
    if (hasReplied(root, fullName || profile.fullName)) {
      await closeConversation(root);
      return { status: 'replied', profile };
    }
    if (attachments?.length) {
      const err = await attachFiles(root, attachments);
      if (err) {
        await closeConversation(root);
        return { status: 'error', profile, error: err };
      }
    }
    if (text) await insertText(box, text);
    await sleep(rand(800, 1600));
    const send = await waitFor(() => {
      const b = root.querySelector('button.msg-form__send-button, button.msg-form__send-btn, button[type="submit"]');
      return b && !b.disabled ? b : null;
    }, 6000);
    if (!send) return { status: 'error', profile, error: "Bouton « Envoyer » du message introuvable." };
    await humanClick(send);
    await sleep(rand(1500, 2500));
    await closeConversation(root);
    return { status: 'sent', profile };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handlers = { scrapeProfile: async () => ({ profile: await loadProfile() }), scrapePosts, connect, checkConnection, sendMessage };
    const fn = handlers[msg.command];
    if (!fn) return false;
    fn(msg.payload || {})
      .then(sendResponse)
      .catch((e) => sendResponse({ status: 'error', error: e.message }));
    return true;
  });

  // ---------- Bouton d'import ----------

  // Lecture des résultats de recherche, indépendante des classes CSS de LinkedIn
  // (qui changent souvent) : on part des liens /in/ et on remonte à la carte du résultat.
  const DEGREE_RE = /^[•·\s]*(1er|2e|3e( et \+)?|1st|2nd|3rd\+?|\d+(e|er|st|nd|rd|th)\+?)$/i;
  const NOISE_RE = /^(se connecter|connect|message|suivre|follow|en attente|pending|voir le profil.*|view .*profile|statut.*|•)$/i;

  function cleanName(t) {
    return norm(String(t || '')
      .split('\n')[0]
      .replace(/^voir le profil de\s+/i, '')
      .replace(/^view\s+/i, '').replace(/[’']s profile$/i, '')
      .replace(/\s*[•·]\s*(1er|2e|3e.*|1st|2nd|3rd.*)$/i, ''));
  }

  // Lien « texte » vers un profil (le nom), hors mentions de relations en commun.
  function isNameLink(a) {
    if (!normalizeUrl(a.href)) return false;
    if (!norm(a.innerText || a.getAttribute('aria-label'))) return false;
    const around = norm(a.parentElement?.innerText || '');
    return !/en commun|in common/i.test(around);
  }

  function cardFor(a) {
    const url = normalizeUrl(a.href);
    let card = a;
    // On remonte tant que le parent ne contient pas le nom d'un autre résultat.
    for (let el = a.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.matches('ul, ol, [role="list"], main, nav, header, aside')) break;
      const other = [...el.querySelectorAll('a[href*="/in/"]')].some((x) => normalizeUrl(x.href) !== url && isNameLink(x));
      if (other) break;
      card = el;
      if (el.matches('li, [role="listitem"], [data-chameleon-result-urn]')) break;
    }
    return card;
  }

  function scrapeSearchResults() {
    const out = [];
    const seen = new Set();
    const root = document.querySelector('main') || document.body;
    for (const a of root.querySelectorAll('a[href*="/in/"]')) {
      if (a.closest('#yucan-panel, nav, header, aside, [data-yucan]')) continue;
      const url = normalizeUrl(a.href);
      if (!url || seen.has(url)) continue;
      const text = norm(a.querySelector('span[aria-hidden="true"]')?.innerText || a.innerText || a.getAttribute('aria-label'));
      if (!text || !isNameLink(a)) continue; // photo ou relation en commun
      const fullName = cleanName(a.querySelector('span[aria-hidden="true"]')?.innerText || a.innerText || a.getAttribute('aria-label'));
      if (!fullName || /membre linkedin|linkedin member|utilisateur linkedin/i.test(fullName)) continue;
      const card = cardFor(a);
      seen.add(url);
      const lines = String(card.innerText || '').split('\n').map(norm).filter(Boolean)
        .filter((l) => l !== fullName && !l.startsWith(fullName) && !DEGREE_RE.test(l) && !NOISE_RE.test(l))
        .filter((l) => !/relations? en commun|in common|abonnés|followers/i.test(l));
      out.push({
        url,
        fullName,
        headline: norm(card.querySelector('.entity-result__primary-subtitle')?.innerText) || lines[0] || '',
        location: norm(card.querySelector('.entity-result__secondary-subtitle')?.innerText) || lines[1] || '',
      });
    }
    return out;
  }

  function pageKind() {
    if (/\/search\/results\/people/.test(location.pathname)) return 'search';
    if (/^\/in\/[^/]+\/?$/.test(location.pathname)) return 'profile';
    return null;
  }

  let panel;
  async function renderPanel() {
    const kind = pageKind();
    if (!kind) {
      panel?.remove();
      panel = null;
      return;
    }
    if (panel && panel.dataset.kind === kind && panel.dataset.path === location.pathname) return;
    panel?.remove();
    const res = await chrome.runtime.sendMessage({ type: 'getCampaigns' }).catch(() => null);
    if (!res || res.error) {
      // Extension non reliée à l'application : pas de panneau.
      panel?.remove();
      panel = null;
      return;
    }
    const campaigns = res.campaigns || [];
    const lists = res.lists || [];
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const field = 'width:100%;padding:6px;margin-bottom:8px;border:0;border-radius:8px;color:#2a1033;box-sizing:border-box';
    panel = document.createElement('div');
    panel.id = 'yucan-panel';
    panel.dataset.kind = kind;
    panel.dataset.path = location.pathname;
    panel.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:99999;background:linear-gradient(160deg,#e0197d,#5a0f78);border-radius:16px;padding:14px;box-shadow:0 8px 28px rgba(90,15,120,.35);font:14px system-ui,sans-serif;color:#fff;width:270px';
    const defaultName = new URLSearchParams(location.search).get('keywords') || 'Recherche LinkedIn';
    panel.innerHTML = `
      <div style="margin-bottom:8px"><span style="font:500 18px Georgia,serif;letter-spacing:.08em">YUCAN</span> <span style="color:#ffd21f;font-weight:600;font-size:12px">Prospection</span></div>
      <select class="pia-list" style="${field}">
        <option value="__new">+ Nouvelle liste</option>
        ${lists.map((l) => `<option value="${l.id}">Liste : ${esc(l.name)}</option>`).join('')}
        <option value="">Sans liste</option>
      </select>
      <input class="pia-name" style="${field}" placeholder="Nom de la nouvelle liste" value="${esc(defaultName)}">
      <select class="pia-campaign" style="${field}">
        <option value="">Sans scénario (à lancer plus tard)</option>
        ${campaigns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
      </select>
      ${
        kind === 'search'
          ? `<select class="pia-pages" style="${field}">
              <option value="1">Cette page seulement</option>
              <option value="3">3 pages (≈ 30 profils)</option>
              <option value="5">5 pages (≈ 50 profils)</option>
              <option value="10">10 pages (≈ 100 profils)</option>
            </select>`
          : ''
      }
      <button style="width:100%;padding:9px;border:0;border-radius:8px;background:#ffd21f;color:#5a0f78;font-weight:700;cursor:pointer">
        ${kind === 'search' ? 'Importer les résultats' : 'Ajouter ce profil'}
      </button>
      <div class="pia-msg" style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.85)"></div>`;
    const $ = (sel) => panel.querySelector(sel);
    const [listSel, nameInput, campSel, pagesSel, button, msg] = [$('.pia-list'), $('.pia-name'), $('.pia-campaign'), $('.pia-pages'), $('button'), $('.pia-msg')];
    const syncName = () => (nameInput.style.display = listSel.value === '__new' ? '' : 'none');
    listSel.addEventListener('change', syncName);
    syncName();
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        let items = [];
        if (kind === 'search') {
          const pages = Number(pagesSel?.value || 1);
          const seen = new Set();
          for (let page = 1; page <= pages; page++) {
            msg.textContent = `Lecture de la page ${page}/${pages}…`;
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            await sleep(1200 + Math.random() * 800);
            for (const it of scrapeSearchResults()) {
              if (seen.has(it.url)) continue;
              seen.add(it.url);
              items.push(it);
            }
            if (page === pages) break;
            const next = findButton(/^(suivant|next)$/i);
            if (!next || next.disabled) break;
            const before = scrapeSearchResults()[0]?.url;
            await humanClick(next);
            await waitFor(() => scrapeSearchResults()[0]?.url !== before, 15000).catch(() => null);
            await sleep(2000 + Math.random() * 2000); // rythme humain entre deux pages
          }
        } else {
          items = [scrapeProfile()].filter((p) => p.fullName).map((p) => ({ ...p, url: location.href }));
        }
        if (!items.length) {
          msg.textContent = 'Aucun profil trouvé sur cette page.';
          return;
        }
        const isNew = listSel.value === '__new';
        const res = await chrome.runtime.sendMessage({
          type: 'importProspects',
          items,
          campaignId: campSel.value,
          listId: isNew ? '' : listSel.value,
          newListName: isNew ? nameInput.value.trim() || defaultName : '',
        });
        msg.textContent = res?.error ? `Erreur : ${res.error}` : `${res.added} ajouté(s), ${res.skipped} déjà présent(s).`;
        if (!res?.error && isNew && res.listId) {
          // La liste existe maintenant : on la sélectionne pour les imports suivants.
          const opt = document.createElement('option');
          opt.value = res.listId;
          opt.textContent = `Liste : ${nameInput.value.trim() || defaultName}`;
          listSel.insertBefore(opt, listSel.options[1]);
          listSel.value = res.listId;
          syncName();
        }
      } finally {
        button.disabled = false;
      }
    });
    document.body.appendChild(panel);
  }

  setInterval(() => renderPanel().catch(() => {}), 1500);
})();
