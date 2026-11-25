import { setupPairReader } from './pairing.js';

const byId = (id) => document.getElementById(id);
const desktop = location.hostname === '127.0.0.1';
const defaults = () => ({ theme: 'dark', accent: 'violet', density: 'comfortable', groups: {} });
const groups = { outputs: 'Ações rápidas', scenes: 'Cenas', audio: 'Áudio' };
const settingsKey = 'nexdeck.preferences.v1';
const tutorialKey = 'nexdeck.tutorial.v3';
document.documentElement.dataset.mode = desktop ? 'host' : 'remote';
const pairingKey = 'nexdeck-token';

function read(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function save(storage, key, value) {
  try { storage.setItem(key, value); } catch { /* The panel can run without persistence. */ }
}

function loadPreferences() {
  const result = defaults();
  try {
    const saved = JSON.parse(read(localStorage, settingsKey));
    if (!saved) return result;
    if (['violet', 'cyan', 'lime'].includes(saved.accent)) result.accent = saved.accent;
    if (saved.theme === 'light') result.theme = 'light';
    if (saved.density === 'compact') result.density = saved.density;
    for (const group of Object.keys(groups)) {
      const value = saved.groups?.[group];
      if (!value) continue;
      result.groups[group] = {
        order: Array.isArray(value.order) ? value.order.filter((name) => typeof name === 'string') : [],
        hidden: Array.isArray(value.hidden) ? value.hidden.filter((name) => typeof name === 'string') : [],
      };
    }
  } catch { return result; }
  return result;
}

let preferences = loadPreferences();
let token = desktop ? '' : read(localStorage, pairingKey) || read(sessionStorage, pairingKey) || '';
let commandBusy = false;
let connectBusy = false;
let latestState;
let bootAddresses = [];
let refreshSequence = 0;

const fragment = location.hash.slice(1);
if (!desktop && /^[A-Za-z0-9_-]{32}$/.test(fragment)) {
  token = fragment;
  save(localStorage, pairingKey, token);
  save(sessionStorage, pairingKey, token);
  history.replaceState(null, '', location.pathname);
}

async function api(path, data, candidate) {
  const requestToken = candidate ?? token;
  const headers = { Authorization: 'Bearer ' + requestToken };
  const options = { headers, signal: AbortSignal.timeout(8000) };
  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.method = 'POST';
    options.body = JSON.stringify(data);
  }
  let response;
  try { response = await fetch('/api/' + path, options); }
  catch { throw new Error('O painel não alcançou o NexDeck. Confira se o servidor está aberto.'); }
  const result = await response.json();
  if (!response.ok) {
    if (!desktop && candidate === undefined && requestToken === token && response.status === 401) {
      token = '';
      save(localStorage, pairingKey, '');
      save(sessionStorage, pairingKey, '');
    }
    throw new Error(result.error);
  }
  return result;
}

function notice(message = '') {
  const banner = byId('notice');
  if (banner.textContent !== message) banner.textContent = message;
  banner.hidden = !message;
}

function icon(name) {
  const element = document.createElement('i');
  element.className = 'ico ' + name;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function listControls(state) {
  return {
    outputs: [
      { key: 'record', name: 'Gravação', label: state.recording ? 'Parar gravação' : 'Iniciar gravação',
        icon: state.recording ? 'stop' : 'record', active: state.recording, danger: true,
        data: { action: 'record', enabled: !state.recording } },
      { key: 'stream', name: 'Transmissão', label: state.streaming ? 'Parar live' : 'Iniciar live',
        icon: state.streaming ? 'stop' : 'live', active: state.streaming, confirmStart: !state.streaming,
        data: { action: 'stream', enabled: !state.streaming } },
      { key: 'replay', name: 'Replay', label: 'Salvar replay', detail: state.replay ? '' : 'Buffer desativado',
        icon: 'replay', disabled: !state.replay, data: { action: 'replay' } },
    ],
    scenes: (state.scenes || []).map((name) => ({
      key: name, name, label: name, detail: name === state.currentScene ? 'Em exibição' : '',
      icon: 'layers', active: name === state.currentScene, data: { action: 'scene', name },
    })),
    audio: (state.audio || []).map(({ name, muted }) => ({
      key: name, name, label: name, detail: muted ? 'Silenciado' : 'Sem silenciar',
      icon: muted ? 'mute' : /mic/i.test(name) ? 'mic' : 'volume',
      active: muted, data: { action: 'mute', name, enabled: !muted },
    })),
  };
}

function groupPreferences(group) {
  return preferences.groups[group] ??= { order: [], hidden: [] };
}

function ordered(group, buttons) {
  const lookup = new Map(buttons.map((button) => [button.key, button]));
  const sorted = [];
  for (const key of groupPreferences(group).order) {
    if (lookup.has(key)) sorted.push(lookup.get(key));
    lookup.delete(key);
  }
  return [...sorted, ...lookup.values()];
}

function confirmLive() {
  const dialog = byId('live-dialog');
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}

async function operate(control) {
  if (commandBusy) return;
  commandBusy = true;
  try {
    if (control.confirmStart && !await confirmLive()) return;
    notice();
    await api('command', control.data);
    await refresh();
  } catch (error) {
    notice(error.message);
  } finally {
    commandBusy = false;
  }
}

function syncButtons(id, buttons, container = byId(id)) {
  const existing = new Map([...container.children].map((button) => [button.dataset.key, button]));
  buttons.forEach((control, index) => {
    const { key, label, detail, active, disabled, danger } = control;
    let button = existing.get(key);
    if (!button) {
      button = document.createElement('button');
      button.className = 'tile';
      button.dataset.key = key;
      button.append(icon(control.icon), document.createElement('strong'), document.createElement('small'));
    }
    existing.delete(key);
    if (container.children[index] !== button) container.insertBefore(button, container.children[index] || null);
    const [symbol, title, subtitle] = button.children;
    const iconClass = 'ico ' + control.icon;
    if (symbol.className !== iconClass) symbol.className = iconClass;
    if (title.textContent !== label) title.textContent = label;
    if (subtitle.textContent !== (detail || '')) subtitle.textContent = detail || '';
    subtitle.hidden = !detail;
    button.disabled = Boolean(disabled);
    button.classList.toggle('active', Boolean(active));
    button.classList.toggle('danger', Boolean(danger));
    if (id === 'audio') button.setAttribute('aria-pressed', String(Boolean(active)));
    if (id === 'scenes') button.setAttribute('aria-current', String(Boolean(active)));
    button.onclick = () => void operate(control);
  });
  for (const button of existing.values()) button.remove();
}

const deckLabels = { outputs: 'Ações', scenes: 'Cenas', audio: 'Áudio', settings: 'Configurações' };
let currentGroup = 'outputs';
let page = 0;

let pageSize = 0;

let deckLayout;
function fitDeck(grid, buttons) {
  const style = getComputedStyle(grid);
  const width = grid.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  const height = grid.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom);
  const gap = Number.parseFloat(style.gap);
  const minWidth = Number.parseFloat(style.gridAutoColumns);
  const maxColumns = Number(style.getPropertyValue('--deck-max-columns'));
  const maxRows = Number(style.getPropertyValue('--deck-max-rows'));
  const signature = JSON.stringify([width, height, gap, minWidth, maxColumns, maxRows, style.gridAutoRows,
    buttons.map(({ label, detail }) => [label, detail])]);
  if (deckLayout?.signature !== signature) {
    const columns = Math.max(1, Math.min(buttons.length, maxColumns, Math.floor((width + gap) / (minWidth + gap))));
    const probe = document.createElement('div');
    probe.className = 'grid deck-measure';
    probe.dataset.columns = columns;
    probe.inert = true;
    const samples = new Map();
    for (const button of buttons) {
      const key = JSON.stringify([button.label, button.detail]);
      if (!samples.has(key)) samples.set(key, { ...button, key });
    }
    syncButtons('', [...samples.values()], probe);
    grid.append(probe);
    let rowHeight = 0;
    for (const tile of probe.children) rowHeight = Math.max(rowHeight, tile.getBoundingClientRect().height);
    probe.remove();
    const rows = Math.max(1, Math.min(maxRows, Math.floor((height + gap) / (rowHeight + gap))));
    deckLayout = { signature, columns, capacity: columns * rows };
  }
  grid.dataset.columns = deckLayout.columns;
  const { capacity } = deckLayout;
  if (pageSize && capacity !== pageSize) page = Math.floor(page * pageSize / capacity);
  pageSize = capacity;
}

function selectGroup(group) {
  if (group === currentGroup) return;
  currentGroup = group;
  page = 0;
  renderDeck(latestState);
  const grid = byId(group === 'settings' ? 'settings-panel' : group);
  grid.scrollTop = 0;
  grid.classList.remove('enter');
  requestAnimationFrame(() => grid.classList.add('enter'));
}

function renderDeck(state) {
  if (!state?.connected) return;
  const settings = currentGroup === 'settings';
  byId('deck-title').textContent = deckLabels[currentGroup];
  byId('settings-panel').hidden = !settings;
  byId('edit-tab').hidden = settings;
  byId('edit-tab').setAttribute('aria-label', 'Editar aba ' + deckLabels[currentGroup]);
  for (const button of byId('dock').querySelectorAll('[data-group]')) {
    button.setAttribute('aria-pressed', String(button.dataset.group === currentGroup));
  }
  for (const group of Object.keys(groups)) byId(group).hidden = group !== currentGroup;
  byId('empty').hidden = true;
  if (settings) {
    byId('pager').hidden = true;
    return;
  }

  const visible = ordered(currentGroup, listControls(state)[currentGroup])
    .filter(({ key }) => !groupPreferences(currentGroup).hidden.includes(key));
  const grid = byId(currentGroup);
  if (!visible.length) {
    byId('pager').hidden = true;
    grid.hidden = true;
    byId('empty').hidden = false;
    byId('empty').textContent = 'Nenhum botão visível nesta aba. Toque no lápis para mostrar os controles.';
    return;
  }

  fitDeck(grid, visible);
  const total = Math.ceil(visible.length / pageSize);
  page = Math.min(page, total - 1);
  byId('pager').hidden = total < 2;
  byId('previous-page').disabled = page === 0;
  byId('next-page').disabled = page === total - 1;
  const pageLabel = (page + 1) + ' / ' + total;
  if (byId('page-number').textContent !== pageLabel) byId('page-number').textContent = pageLabel;
  syncButtons(currentGroup, visible.slice(page * pageSize, (page + 1) * pageSize));
}

function render(state) {
  const wasConnected = latestState?.connected;
  latestState = state;
  const status = byId('status');
  const statusText = state.connected ? 'OBS conectado' : state.connecting ? 'Conectando…' : 'OBS desconectado';
  if (status.textContent !== statusText) status.textContent = statusText;
  status.classList.toggle('online', Boolean(state.connected));
  syncGuideConnection();

  if (desktop) {
    byId('obs-version').querySelector('span').textContent = state.obsVersion
      ? 'OBS Studio ' + state.obsVersion + (state.obsWebSocketVersion ? ' · WebSocket ' + state.obsWebSocketVersion : '')
      : 'OBS Studio 28+ · WebSocket 5';
    byId('start-connect').hidden = Boolean(state.connected);
    const message = byId('host-connection');
    if (state.connected && !wasConnected) {
      message.textContent = 'OBS conectado. Mantenha o OBS e o NexDeck abertos enquanto usa o celular.';
    } else if (!state.connected && wasConnected) {
      message.innerHTML = 'No OBS, abra <strong>Ferramentas → Configurações do servidor WebSocket</strong>. Ative o servidor (porta 4455) e copie a senha.';
    }
    byId('pair-wait').hidden = Boolean(state.connected);
    byId('pair-content').hidden = !state.connected || !bootAddresses.length;
    byId('no-lan').hidden = !state.connected || Boolean(bootAddresses.length);
    if (state.connected && !wasConnected && bootAddresses.length) void updatePair();
    if (!state.connected) {
      byId('pair-error').hidden = true;
      byId('pair-retry').hidden = true;
    }
    return;
  }

  byId('start').hidden = Boolean(state.connected);
  byId('start-title').textContent = token ? 'Aguardando o OBS' : 'Conecte ao computador';
  byId('start-description').textContent = token
    ? 'No computador, conecte o OBS no NexDeck. Os controles aparecerão aqui.'
    : 'Abra o NexDeck no PC e use o QR de pareamento nesta tela.';
  byId('overview').hidden = !state.connected;
  byId('controls').hidden = !state.connected;
  byId('dock').hidden = !state.connected;
  if (!state.connected) return;
  const scene = state.currentScene || 'Sem cena ativa';
  byId('current-scene').textContent = scene;
  byId('current-scene').title = scene;
  byId('record-status').textContent = state.recording ? 'Gravando' : 'Gravação parada';
  byId('record-status').classList.toggle('on', Boolean(state.recording));
  byId('live-status').textContent = state.streaming ? 'Ao vivo' : 'Fora do ar';
  byId('live-status').classList.toggle('on', Boolean(state.streaming));
  renderDeck(state);
}

async function refresh() {
  const sequence = ++refreshSequence;
  try {
    const state = await api('state');
    if (sequence !== refreshSequence) return;
    if (!latestState || !latestState.connected) notice();
    render(state);
  } catch (error) {
    if (sequence !== refreshSequence) return;
    render({ connected: false });
    byId('status').textContent = 'Painel desconectado';
    notice(error.message);
  }
}

function applyPreferences() {
  document.documentElement.dataset.accent = preferences.accent;
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.dataset.theme = preferences.theme;
  document.querySelector('meta[name=theme-color]').content = preferences.theme === 'light' ? '#f0f4ff' : '#101019';
  for (const control of byId('settings-panel').querySelectorAll('input')) {
    control.checked = preferences[control.name] === control.value;
  }
  byId('density').value = preferences.density;
  if (latestState) render(latestState);
}

function persist() {
  save(localStorage, settingsKey, JSON.stringify(preferences));
  applyPreferences();
}

function moveButton(row, button, group, index, jump, destination) {
  button.type = 'button';
  button.className = 'icon-button';
  button.setAttribute('aria-label', (jump < 0 ? 'Subir ' : 'Descer ') + destination[index].name);
  button.append(icon(jump < 0 ? 'up' : 'down'));
  const target = index + jump;
  button.disabled = target < 0 || target >= destination.length;
  button.onclick = () => {
    [destination[index], destination[target]] = [destination[target], destination[index]];
    const settings = groupPreferences(group);
    const keys = destination.map(({ key }) => key);
    settings.order = [...keys, ...settings.order.filter((key) => !keys.includes(key))];
    persist();
    renderEditor();
    const movedRow = byId('edit-buttons').children[target];
    (movedRow.children[jump < 0 ? 1 : 2].disabled ? movedRow.querySelector('input') :
      movedRow.children[jump < 0 ? 1 : 2]).focus();
  };
  row.append(button);
}

function renderEditor() {
  const editor = byId('edit-buttons');
  editor.replaceChildren();
  const group = currentGroup;
  const buttons = latestState?.connected && listControls(latestState)[group];
  if (!buttons?.length) {
    editor.textContent = 'Nenhum controle disponível nesta aba.';
    return;
  }

  const sorted = ordered(group, buttons);
  sorted.forEach(({ key, name }, index) => {
    const row = document.createElement('div');
    row.className = 'edit-row';
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !groupPreferences(group).hidden.includes(key);
    check.onchange = () => {
      const settings = groupPreferences(group);
      settings.hidden = settings.hidden.filter((item) => item !== key);
      if (!check.checked) settings.hidden.push(key);
      persist();
    };
    label.append(check, document.createTextNode(name));
    row.append(label);
    moveButton(row, document.createElement('button'), group, index, -1, sorted);
    moveButton(row, document.createElement('button'), group, index, 1, sorted);
    editor.append(row);
  });
}

async function updatePair() {
  const address = byId('address').value;
  const qrImage = byId('qr');
  const feedback = byId('pair-error');
  qrImage.hidden = true;
  byId('copy-pair').hidden = true;
  byId('copy-pair-message').textContent = '';
  feedback.hidden = true;
  byId('pair-retry').hidden = true;
  try {
    const { qr, url } = await api('pair?address=' + encodeURIComponent(address));
    if (!latestState?.connected || address !== byId('address').value) return;
    qrImage.src = qr;
    qrImage.hidden = false;
    const copy = byId('copy-pair');
    copy.hidden = !navigator.clipboard;
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        byId('copy-pair-message').textContent = 'Link copiado.';
      } catch {
        byId('copy-pair-message').textContent = 'Não foi possível copiar. Use o QR.';
      }
    };
  } catch (error) {
    if (!latestState?.connected || address !== byId('address').value) return;
    feedback.textContent = error.message;
    feedback.hidden = false;
    byId('pair-retry').hidden = false;
  }
}

let guideIndex = 0;
const guideSteps = [...document.querySelectorAll('.guide-step')].filter(({ dataset }) =>
  dataset.device === 'all' || dataset.device === (desktop ? 'desktop' : 'mobile'));

function syncGuideConnection() {
  const connected = Boolean(latestState?.connected);
  byId('guide-connected').hidden = !connected;
  byId('guide-connect').hidden = connected;
  byId('guide-connect-button').disabled = !token || connectBusy;
  byId('guide-next').disabled = guideSteps[guideIndex]?.contains(byId('guide-connect')) && !connected;
}

function showGuideStep() {
  const step = guideSteps[guideIndex];
  guideSteps.forEach((item) => { item.hidden = item !== step; });
  byId('guide-count').textContent = 'PASSO ' + (guideIndex + 1) + ' DE ' + guideSteps.length;
  const progress = byId('guide-progress');
  progress.max = guideSteps.length;
  progress.value = guideIndex + 1;
  byId('guide-back').hidden = guideIndex === 0;
  byId('guide-next').textContent = guideIndex + 1 === guideSteps.length ? (desktop ? 'Ir para o QR' : 'Abrir painel') : 'Próximo';
  syncGuideConnection();
  step.querySelector('h3').focus();
}

function openGuide(atConnection = false) {
  guideIndex = atConnection ? guideSteps.findIndex((step) => step.contains(byId('guide-connect'))) : 0;
  const dialog = byId('help-dialog');
  dialog.showModal();
  showGuideStep();
}

async function connect(event) {
  event.preventDefault();
  if (connectBusy || !token) return;
  const password = byId('guide-password');
  const feedback = byId('guide-connection-message');
  connectBusy = true;
  syncGuideConnection();
  feedback.textContent = 'Conectando ao OBS…';
  try {
    const result = await api('connect', { password: password.value });
    if (result.connected) {
      password.value = '';
      feedback.textContent = '';
      notice();
    } else {
      feedback.textContent = 'O NexDeck ainda não conseguiu conectar. Confira se o OBS está aberto, o WebSocket está ativado na porta 4455 e a senha foi copiada corretamente.';
    }
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    connectBusy = false;
    await refresh();
    syncGuideConnection();
    if (latestState?.connected && byId('help-dialog').open) byId('guide-next').focus();
  }
}

function setupInstall() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('NexDeck PWA:', error));
  }
  const install = byId('install');
  let prompt;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
    install.hidden = false;
  });
  install.onclick = async () => {
    if (!prompt) return;
    const current = prompt;
    prompt = undefined;
    install.hidden = true;
    try { await current.prompt(); } catch { notice('Abra o menu do navegador para instalar o NexDeck.'); }
  };
  window.addEventListener('appinstalled', () => { install.hidden = true; });
}

function setupUi() {
  if (!desktop) byId('start').hidden = false;
  setupInstall();
  applyPreferences();
  byId('open-help').onclick = () => openGuide();
  byId('start-guide').onclick = () => openGuide();
  byId('host-guide').onclick = () => openGuide();
  byId('start-connect').onclick = () => openGuide(true);
  byId('help-dialog').addEventListener('close', () => {
    save(localStorage, tutorialKey, '1');
    byId('guide-password').value = '';
    byId('guide-connection-message').textContent = '';
  });
  byId('guide-back').onclick = () => {
    guideIndex -= 1;
    showGuideStep();
  };
  byId('guide-next').onclick = () => {
    if (guideIndex + 1 === guideSteps.length) {
      byId('help-dialog').close();
      if (desktop) byId('pair-title').focus();
    } else {
      guideIndex += 1;
      showGuideStep();
    }
  };
  byId('guide-connect').onsubmit = connect;
  if (!desktop && !read(localStorage, tutorialKey)) openGuide();
  byId('edit-tab').onclick = () => {
    byId('custom-title').textContent = 'Editar · ' + deckLabels[currentGroup];
    renderEditor();
    byId('custom-dialog').showModal();
  };
  for (const control of byId('settings-panel').querySelectorAll('input, select')) {
    control.onchange = () => {
      preferences[control.name || control.id] = control.value;
      persist();
    };
  }
  byId('reset').onclick = () => {
    delete preferences.groups[currentGroup];
    persist();
    renderEditor();
  };
  for (const button of byId('dock').querySelectorAll('[data-group]')) {
    button.onclick = () => selectGroup(button.dataset.group);
  }
  for (const [button, offset] of [['previous-page', -1], ['next-page', 1]]) {
    byId(button).onclick = () => {
      page += offset;
      renderDeck(latestState);
      byId(currentGroup).scrollTop = 0;
    };
  }
  if (!desktop) {
    const layout = new ResizeObserver(() => renderDeck(latestState));
    for (const group of Object.keys(groups)) layout.observe(byId(group));
  }
  byId('address').onchange = () => void updatePair();
  byId('pair-retry').onclick = () => void updatePair();
}

let polling = false;
async function pollState() {
  if (polling) return;
  polling = true;
  try {
    while (token) {
      await refresh();
      if (token) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } finally {
    polling = false;
  }
}

function storePairing(newToken) {
  token = newToken;
  save(localStorage, pairingKey, newToken);
  save(sessionStorage, pairingKey, newToken);
}

async function applyPairing(value) {
  let link;
  try { link = new URL(value.trim()); }
  catch { throw new Error('Use o link completo do QR mostrado no NexDeck do computador.'); }
  const candidate = link.hash.slice(1);
  if (!/^[A-Za-z0-9_-]{32}$/.test(candidate) || link.pathname !== '/' || link.search || link.username || link.password) {
    throw new Error('Esse QR não é um link de pareamento do NexDeck.');
  }
  if (link.origin !== location.origin) {
    throw new Error('Esse QR usa outro endereço. Abra o endereço indicado no PC uma vez para instalar ou acessar esse NexDeck.');
  }
  const state = await api('state', undefined, candidate);
  storePairing(candidate);
  refreshSequence += 1;
  notice();
  render(state);
  void pollState();
}

async function init() {
  setupUi();
  if (!desktop) {
    const openPairReader = setupPairReader(applyPairing);
    byId('pair-open').onclick = openPairReader;
    byId('pair-again').onclick = openPairReader;
    window.addEventListener('storage', (event) => {
      if (event.key === pairingKey && event.newValue && event.newValue !== token) {
        storePairing(event.newValue);
        if (polling) void refresh();
        else void pollState();
      }
    });
  }
  if (desktop) {
    while (!token) {
      try {
        const bootstrap = await api('bootstrap');
        token = bootstrap.token;
        byId('start-connect').disabled = false;
        syncGuideConnection();
        bootAddresses = bootstrap.addresses;
        byId('pwa-trust').hidden = !(bootstrap.localCa ?? bootstrap.pwa);
        for (const address of bootAddresses) byId('address').add(new Option(address, address));
      } catch (error) {
        notice(error.message);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  } else if (!token) {
    byId('start').hidden = false;
    byId('status').textContent = 'Celular sem pareamento';
    notice('Toque em Parear nesta tela e use o QR do computador.');
    return;
  }
  if (!desktop) save(localStorage, pairingKey, token);
  void pollState();
}

init().catch((error) => notice(error.message));
