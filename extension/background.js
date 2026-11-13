// Yucan Prospection : l'extension est le « bras » de l'application web.
// Chaque minute, elle demande à l'application la prochaine action à faire,
// l'exécute dans un onglet LinkedIn de votre session, puis renvoie le résultat.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

async function config() {
  const { appUrl = '', token = '' } = await chrome.storage.local.get(['appUrl', 'token']);
  return { appUrl: appUrl.replace(/\/+$/, ''), token };
}

async function api(path, { method = 'GET', body } = {}) {
  const { appUrl, token } = await config();
  if (!appUrl || !token) throw new Error("Extension non reliée : ouvrez l'icône Yucan pour la configurer.");
  const res = await fetch(`${appUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('tick', { periodInMinutes: 1 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('tick', { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick') tick().catch((e) => setStatus(`Erreur : ${e.message}`));
});

async function setStatus(text) {
  await chrome.storage.local.set({ lastStatus: { text, t: Date.now() } });
}

let campaignsCache = { t: 0, data: null };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'getCampaigns') {
      if (Date.now() - campaignsCache.t < 60000 && campaignsCache.data) return campaignsCache.data;
      try {
        campaignsCache = { t: Date.now(), data: await api('/api/extension/campaigns') };
      } catch (e) {
        campaignsCache = { t: Date.now(), data: { error: e.message } };
      }
      return campaignsCache.data;
    }
    if (msg.type === 'importProspects') {
      const res = await api('/api/extension/import', {
        method: 'POST',
        body: { items: msg.items, campaignId: msg.campaignId, listId: msg.listId, newListName: msg.newListName },
      });
      if (msg.newListName) campaignsCache = { t: 0, data: null }; // la nouvelle liste apparaîtra dans le panneau
      return res;
    }
    if (msg.type === 'ping') return api('/api/extension/ping');
    if (msg.type === 'setPaused') return api('/api/extension/ping', { method: 'POST', body: { paused: msg.paused } });
    if (msg.type === 'runNow') return tick({ force: true });
    return null;
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e.message }));
  return true;
});

let running = false;

async function tick({ force = false } = {}) {
  if (running) return { text: 'Une action est déjà en cours.' };
  const { appUrl, token } = await config();
  if (!appUrl || !token) return { text: 'Extension non reliée.' };
  running = true;
  try {
    const { action, wait } = await api('/api/extension/next', { method: 'POST', body: { force } });
    if (!action) {
      await setStatus(wait || 'Rien à faire.');
      return { text: wait };
    }
    await setStatus(`Action en cours (${action.command})…`);
    let result;
    try {
      const payload = { ...action.payload };
      if (payload.attachments?.length) payload.attachments = await downloadAttachments(payload.attachments);
      result = await runInTab(action.url, action.command, payload);
      if (action.command === 'sendMessage' && result.status === 'sent') result.sentText = action.payload.text;
    } catch (e) {
      result = { status: 'error', error: e.message, fatal: !!e.fatal };
    }
    await api('/api/extension/report', { method: 'POST', body: { prospectId: action.prospectId, stepIndex: action.stepIndex, result } });
    const text = result.status === 'error' ? `Erreur : ${result.error}` : `Action faite (${action.command}).`;
    await setStatus(text);
    return { text };
  } finally {
    running = false;
  }
}

// Télécharge les pièces jointes (liens temporaires fournis par l'application) en base64
// pour pouvoir les transmettre à la page LinkedIn.
async function downloadAttachments(list) {
  const out = [];
  for (const a of list) {
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(`Téléchargement impossible : ${a.name}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ name: a.name, type: a.type || res.headers.get('content-type') || 'application/octet-stream', data: btoa(bin) });
  }
  return out;
}

function waitForTabComplete(tabId, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('La page LinkedIn a mis trop de temps à charger.'));
    }, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') listener(tabId, { status: 'complete' });
    });
  });
}

async function askTab(tabId, command, payload) {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { command, payload });
      if (res) return res;
    } catch (e) {
      lastErr = e;
    }
    await sleep(1500);
  }
  throw new Error(`Page LinkedIn injoignable${lastErr ? ` (${lastErr.message})` : ''}.`);
}

async function runInTab(url, command, payload = {}) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    const t = await chrome.tabs.get(tab.id);
    if (!/^https:\/\/www\.linkedin\.com\//.test(t.url || '')) throw new Error('LinkedIn est inaccessible (connexion internet ?).');
    if (/\/(login|authwall|checkpoint|uas\/login)/.test(t.url || '')) {
      const err = new Error('LinkedIn demande une connexion ou une vérification de sécurité.');
      err.fatal = true;
      throw err;
    }
    await sleep(rand(3000, 6000));
    const res = await askTab(tab.id, command, payload);
    // Après la visite du profil, on lit aussi ses derniers posts (onglet Activité).
    if (command === 'scrapeProfile' && res.profile) {
      try {
        const base = (res.profile.url || url).replace(/\/?$/, '/');
        await chrome.tabs.update(tab.id, { url: `${base}recent-activity/shares/` });
        await sleep(800);
        await waitForTabComplete(tab.id);
        await sleep(rand(2500, 4500));
        const r = await askTab(tab.id, 'scrapePosts', {});
        if (Array.isArray(r?.posts)) res.profile.posts = r.posts;
      } catch {
        /* pas de posts lisibles : on garde le reste du profil */
      }
    }
    return res;
  } finally {
    await sleep(rand(1000, 3000));
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
