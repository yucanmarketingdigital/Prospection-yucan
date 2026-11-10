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

  function scrapeProfile() {
    const card = topCard();
    const fullName = norm(document.querySelector('main h1')?.innerText);
    const headline = norm(card.querySelector('.text-body-medium')?.innerText);
    const place = norm(card.querySelector('.text-body-small.inline.t-black--light, span.text-body-small.t-black--light')?.innerText);
    const degree = norm(card.querySelector('.dist-value')?.innerText || '');
    const about = sectionText('about', 2000);
    const experience = sectionText('experience', 2500);
    const education = sectionText('education', 800);
    const connected = /\b1(st|er)?\b/i.test(degree) && !/2|3/.test(degree);
    return {
      fullName,
      firstName: fullName.split(' ')[0] || '',
      lastName: fullName.split(' ').slice(1).join(' '),
      headline,
      company: guessCompany(headline, experience),
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

  async function sendMessage({ text, fullName }) {
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
    await insertText(box, text);
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
    const handlers = { scrapeProfile: async () => ({ profile: await loadProfile() }), connect, checkConnection, sendMessage };
    const fn = handlers[msg.command];
    if (!fn) return false;
    fn(msg.payload || {})
      .then(sendResponse)
      .catch((e) => sendResponse({ status: 'error', error: e.message }));
    return true;
  });

  // ---------- Bouton d'import ----------

  function scrapeSearchResults() {
    const out = [];
    const seen = new Set();
    for (const li of document.querySelectorAll('main li, main [data-chameleon-result-urn]')) {
      const link = [...li.querySelectorAll('a[href*="/in/"]')].find((a) => norm(a.querySelector('span[aria-hidden="true"]')?.innerText || ''));
      if (!link) continue;
      const url = normalizeUrl(link.href);
      const fullName = norm(link.querySelector('span[aria-hidden="true"]').innerText);
      if (!url || seen.has(url) || /membre linkedin|linkedin member/i.test(fullName)) continue;
      seen.add(url);
      out.push({
        url,
        fullName,
        headline: norm(li.querySelector('.entity-result__primary-subtitle, .t-14.t-black.t-normal')?.innerText),
        location: norm(li.querySelector('.entity-result__secondary-subtitle, .t-14.t-normal:not(.t-black)')?.innerText),
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
    panel = document.createElement('div');
    panel.dataset.kind = kind;
    panel.dataset.path = location.pathname;
    panel.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:99999;background:linear-gradient(160deg,#e0197d,#5a0f78);border-radius:16px;padding:14px;box-shadow:0 8px 28px rgba(90,15,120,.35);font:14px system-ui,sans-serif;color:#fff;width:270px';
    panel.innerHTML = `
      <div style="margin-bottom:8px"><span style="font:500 18px Georgia,serif;letter-spacing:.08em">YUCAN</span> <span style="color:#ffd21f;font-weight:600;font-size:12px">Prospection</span></div>
      <select style="width:100%;padding:6px;margin-bottom:8px;border:0;border-radius:8px;color:#2a1033">
        <option value="">Sans scénario (à lancer plus tard)</option>
        ${campaigns.map((c) => `<option value="${c.id}">${c.name.replace(/</g, '&lt;')}</option>`).join('')}
      </select>
      <button style="width:100%;padding:9px;border:0;border-radius:8px;background:#ffd21f;color:#5a0f78;font-weight:700;cursor:pointer">
        ${kind === 'search' ? 'Importer les résultats de cette page' : 'Ajouter ce profil'}
      </button>
      <div class="pia-msg" style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.85)"></div>`;
    const [select, button, msg] = [panel.querySelector('select'), panel.querySelector('button'), panel.querySelector('.pia-msg')];
    button.addEventListener('click', async () => {
      let items;
      if (kind === 'search') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        await sleep(1200);
        items = scrapeSearchResults();
      } else {
        items = [scrapeProfile()].filter((p) => p.fullName).map((p) => ({ ...p, url: location.href }));
      }
      if (!items.length) {
        msg.textContent = 'Aucun profil trouvé sur cette page.';
        return;
      }
      const res = await chrome.runtime.sendMessage({ type: 'importProspects', items, campaignId: select.value });
      msg.textContent = res?.error ? `Erreur : ${res.error}` : `${res.added} ajouté(s), ${res.skipped} déjà présent(s).`;
    });
    document.body.appendChild(panel);
  }

  setInterval(() => renderPanel().catch(() => {}), 1500);
})();
