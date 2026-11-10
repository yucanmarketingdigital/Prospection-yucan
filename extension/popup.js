const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

async function show() {
  const { appUrl, token, lastStatus } = await chrome.storage.local.get(['appUrl', 'token', 'lastStatus']);
  if (!appUrl || !token) {
    $('setup').hidden = false;
    $('connected').hidden = true;
    $('appUrl').value = appUrl || '';
    return;
  }
  $('setup').hidden = true;
  $('connected').hidden = false;
  const res = await send({ type: 'ping' });
  if (!res || res.error) {
    $('state').innerHTML = `<span class="err">Connexion impossible : ${res?.error || 'erreur'}</span>`;
    $('toggle').hidden = true;
    return;
  }
  $('toggle').hidden = false;
  $('state').innerHTML = `<b class="ok">● Reliée</b> ${res.name ? `à ${res.name}` : ''}<br>Prospection : <b>${res.paused ? 'en pause' : 'active'}</b>${res.toValidate ? `<br>${res.toValidate} message(s) à valider` : ''}`;
  $('toggle').textContent = res.paused ? 'Démarrer la prospection' : 'Mettre en pause';
  $('toggle').onclick = async () => {
    await send({ type: 'setPaused', paused: !res.paused });
    show();
  };
  if (lastStatus) $('last').textContent = `Dernière activité : ${lastStatus.text} (${new Date(lastStatus.t).toLocaleTimeString('fr-FR')})`;
}

$('save').onclick = async () => {
  let appUrl = $('appUrl').value.trim().replace(/\/+$/, '');
  if (appUrl && !/^https?:\/\//.test(appUrl)) appUrl = `https://${appUrl}`;
  const token = $('token').value.trim();
  if (!appUrl || !token) return ($('setupMsg').textContent = 'Remplissez les deux champs.');
  await chrome.storage.local.set({ appUrl, token });
  const res = await send({ type: 'ping' });
  if (!res || res.error) {
    $('setupMsg').innerHTML = `<span class="err">${res?.error || 'Connexion impossible'}</span>`;
    return;
  }
  show();
};
$('edit').onclick = async () => {
  await chrome.storage.local.remove('token');
  show();
};
$('open').onclick = async () => {
  const { appUrl } = await chrome.storage.local.get('appUrl');
  chrome.tabs.create({ url: appUrl });
};
$('run').onclick = async () => {
  $('run').textContent = 'Action en cours…';
  const res = await send({ type: 'runNow' });
  $('run').textContent = 'Exécuter une action maintenant';
  $('last').textContent = res?.text || res?.error || '';
};
show();
