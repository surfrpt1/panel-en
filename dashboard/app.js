'use strict';

/* ============================================================
 * Surfrpt Panel — Dashboard (clean-room English rewrite)
 * Talks to the same admin APIs as the original edgetunnel backend.
 * ============================================================ */

/* ---------- Constants ---------- */
const SUBCONFIG_URL = 'https://raw.githubusercontent.com/cmliu/cmliu/main/SUBCONFIG.json';
const SUBAPI_LIST_URL = 'https://raw.githubusercontent.com/cmliu/cmliu/main/SUBAPI.json';
const PATH_TEMPLATES_URL = 'https://raw.githubusercontent.com/cmliu/cmliu/main/json/edt-path-config.json';

const PROXY_PROTOCOLS = ['socks5', 'http', 'https', 'turn', 'sstp'];

const PANEL_PROTOCOLS = ['vless', 'vmess', 'trojan', 'ss'];
const PANEL_PROTOCOLS_LABELS = { vless: 'VLESS', vmess: 'VMess', trojan: 'Trojan', ss: 'Shadowsocks' };
const PANEL_TRANSPORTS = ['ws', 'grpc', 'xhttp', 'tcp', 'http', 'kcp', 'quic', 'splithttp'];

const HTTPS_PROXY_MIN_VERSION = 0;
const TURN_SSTP_PROXY_MIN_VERSION = 0;
const CHAIN_PROXY_MIN_VERSION = 20260506175102;

const latencyFetchTimeoutMs = 8000;

const echDNSOptions = [
  { value: 'https://cloudflare-dns.com/dns-query', label: 'Cloudflare DoH (Recommended)' },
  { value: 'https://dns.google/dns-query', label: 'Google DoH' },
  { value: 'https://dns.quad9.net/dns-query', label: 'Quad9 DoH' },
  { value: 'https://dns.adguard-dns.com/dns-query', label: 'AdGuard DoH' },
  { value: 'https://dns.nextdns.io', label: 'NextDNS DoH' },
  { value: 'custom', label: 'Custom' }
];
const echSNIOptions = [
  { value: 'cloudflare-ech.com', label: 'cloudflare-ech.com (Recommended)' },
  { value: 'custom', label: 'Custom' }
];

/* ---------- State ---------- */
let currentConfig = {};
let originalConfig = {};
const modifiedSections = new Set();
let networkInfoLoaded = false;
let logsLoaded = false;
let subConfigData = null;
let pathTemplatePresets = [];
let pathTemplateOriginal = {};
let currentProxyType = null;
let currentProxyFieldId = null;
let chainProxyFeatureEnabled = true;
let httpsProxyFeatureEnabled = true;
let turnSstpProxyFeatureEnabled = true;
let simpleMode = false;

/* Network info state */
const NETWORK_API_TIMEOUT_MS = 6180;
const NETWORK_BACKGROUND_START_DELAY_MS = 1200;
const NETWORK_BACKGROUND_IDLE_TIMEOUT_MS = 2500;
const NETWORK_BACKGROUND_TASK_GAP_MS = 420;
const NETWORK_BACKGROUND_TASK_TIMEOUT_MS = (NETWORK_API_TIMEOUT_MS * 3) + 1200;
let networkInfoScheduled = false;
let networkInfoLoadPromise = null;
let networkPrivacyVisible = false;
let cloudFlareEntries = [];
let cloudFlareActiveIndex = 0;
let twitterEntries = [];
let twitterActiveIndex = 0;
let indiaEntries = [];
let indiaActiveIndex = 0;

/* Latency state */
const latencySiteLatencies = {};
const latencySiteIntervals = {};
const latencySiteUpdateInProgress = {};
const latencyUIState = {};
const latencyFetchControllers = new Set();
let latencyTestActive = false;
let latencyTestSessionId = 0;

/* Proxy explore state (kept per-protocol on window like the original) */
const proxyConfigs = {
  socks5: {
    modalId: 'exploreSocks5Modal', regionSelectId: 'socks5RegionSelect',
    proxySelectId: 'socks5ProxySelect', proxySelectGroupId: 'socks5ProxySelectGroup',
    confirmBtnId: 'socks5ConfirmBtn',
    listData: 'socks5ListData', countryMap: 'socks5CountryMap',
    verificationStatus: 'socks5VerificationStatus', verificationTimeouts: 'socks5VerificationTimeouts',
    url: 'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/socks5.json',
    description: 'SOCKS5 list', inputId: 'socks5Addr',
    verifySingleFunction: (proxy, signal) => verifySingleProxy(proxy, 'socks5', signal)
  },
  http: {
    modalId: 'exploreHTTPModal', regionSelectId: 'httpRegionSelect',
    proxySelectId: 'httpProxySelect', proxySelectGroupId: 'httpProxySelectGroup',
    confirmBtnId: 'httpConfirmBtn',
    listData: 'httpListData', countryMap: 'httpCountryMap',
    verificationStatus: 'httpVerificationStatus', verificationTimeouts: 'httpVerificationTimeouts',
    url: 'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/http.json',
    description: 'HTTP list', inputId: 'httpAddr',
    verifySingleFunction: (proxy, signal) => verifySingleProxy(proxy, 'http', signal)
  },
  https: {
    modalId: 'exploreHTTPSModal', regionSelectId: 'httpsRegionSelect',
    proxySelectId: 'httpsProxySelect', proxySelectGroupId: 'httpsProxySelectGroup',
    confirmBtnId: 'httpsConfirmBtn',
    listData: 'httpsListData', countryMap: 'httpsCountryMap',
    verificationStatus: 'httpsVerificationStatus', verificationTimeouts: 'httpsVerificationTimeouts',
    url: 'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/https.json',
    description: 'HTTPS list', inputId: 'httpsAddr',
    verifySingleFunction: (proxy, signal) => verifySingleProxy(proxy, 'https', signal)
  },
  proxyip: {
    modalId: 'getMoreProxyIPModal', regionSelectId: 'proxyIPDataRegionSelect',
    proxySelectId: 'proxyIPProxySelect', proxySelectGroupId: 'proxyIPProxySelectGroup',
    confirmBtnId: 'proxyIPConfirmBtn',
    listData: 'proxyIPListData', countryMap: 'proxyIPCountryMap',
    verificationStatus: 'proxyIPVerificationStatus', verificationTimeouts: 'proxyIPVerificationTimeouts',
    url: 'https://zip.cm.edu.kg.cmliussss.net/all.json',
    description: 'ProxyIP list', inputId: 'proxyIPInput',
    verifySingleFunction: (proxy, signal) => verifySingleProxyIP(proxy, signal)
  }
};
let selectedProxyIPs = [];
const continentInfo = {
  'AS': { emoji: '🌏', name: 'Asia' }, 'NA': { emoji: '🌎', name: 'North America' },
  'EU': { emoji: '🌍', name: 'Europe' }, 'AF': { emoji: '🌍', name: 'Africa' },
  'SA': { emoji: '🌎', name: 'South America' }, 'OC': { emoji: '🌏', name: 'Oceania' },
  'AN': { emoji: '❄️', name: 'Antarctica' }
};

/* ---------- DOM helpers ---------- */
function $(id) { return document.getElementById(id); }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = NETWORK_API_TIMEOUT_MS) {
  const { signal: externalSignal, ...fetchOptions } = options || {};
  const controller = new AbortController();
  let timeoutReached = false;
  let externalAbortHandler = null;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else {
      externalAbortHandler = () => controller.abort();
      externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
    }
  }
  const timeoutId = setTimeout(() => { timeoutReached = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (error) {
    if (timeoutReached) throw new Error(`request timeout after ${timeoutMs}ms: ${url}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && externalAbortHandler) externalSignal.removeEventListener('abort', externalAbortHandler);
  }
}

async function fetchWithAutoMirror(originalUrl, description = 'resource') {
  const rawGithubPrefix = 'https://raw.githubusercontent.com';
  const mirrorDomains = [
    'https://github.090227.xyz/raw.githubusercontent.com',
    'https://github.cmliussss.com/raw.githubusercontent.com',
    'https://github.cmliussss.net/raw.githubusercontent.com'
  ];
  const candidates = [{ url: originalUrl, label: 'Original' }];
  if (originalUrl.startsWith(rawGithubPrefix)) {
    mirrorDomains.forEach((domain) => {
      candidates.push({ url: originalUrl.replace(rawGithubPrefix, domain) });
    });
  }
  const controllers = candidates.map(() => new AbortController());
  const requests = candidates.map((candidate, index) => (async () => {
    const response = await fetch(candidate.url, { signal: controllers[index].signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return { ...candidate, index, text };
  })());
  try {
    const winner = await Promise.any(requests);
    controllers.forEach((controller, index) => { if (index !== winner.index) controller.abort(); });
    return winner.text;
  } catch (error) {
    throw new Error(`${description} fetch failed (original + ${Math.max(candidates.length - 1, 0)} mirrors)`);
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp + 8 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function translateLogType(type, ua = '') {
  if (type === 'Get_SUB') {
    if (String(ua || '').toLowerCase().includes('subconverter')) {
      return { text: 'Subscription Convert', color: '#3b82f6' };
    }
    return { text: 'Fetch Subscription', color: '#10b981' };
  }
  const map = {
    Admin_Login: { text: 'Admin Login', color: '#f59e0b' },
    Save_Config: { text: 'Save Config', color: '#8b5cf6' },
    Init_Config: { text: 'Reset Config', color: '#ef4444' },
    Save_Custom_IPs: { text: 'Custom IPs', color: '#06b6d4' }
  };
  return map[type] || { text: type, color: '#6b7280' };
}

/* ---------- Theme ---------- */
function initializeTheme() {
  const saved = localStorage.getItem('theme');
  let theme = saved;
  if (!saved) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(theme);
}

function applyTheme(theme) {
  const btn = $('themeToggle');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
    if (btn) { btn.textContent = '☀️'; btn.title = 'Switch to light mode'; }
  } else {
    document.documentElement.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
    if (btn) { btn.textContent = '🌙'; btn.title = 'Switch to dark mode'; }
  }
}

function toggleTheme() {
  applyTheme(document.documentElement.classList.contains('dark-mode') ? 'light' : 'dark');
}

/* ---------- User mode (simple / advanced) ---------- */
function initUserMode() {
  simpleMode = localStorage.getItem('userMode') === 'simple';
  applyUserMode();
}

function toggleUserMode() {
  simpleMode = !simpleMode;
  localStorage.setItem('userMode', simpleMode ? 'simple' : 'advanced');
  applyUserMode();
  showToast(simpleMode ? 'Simple mode enabled — advanced modules hidden' : 'Advanced mode enabled', 'success');
}

function applyUserMode() {
  const btn = $('userModeToggle');
  document.querySelectorAll('.advanced-module').forEach(module => {
    if (simpleMode) {
      module.classList.add('simple-hidden');
      module.classList.add('collapsed');
      const content = module.querySelector('.module-content');
      if (content) content.style.display = 'none';
    } else {
      module.classList.remove('simple-hidden');
    }
  });
  if (btn) {
    btn.textContent = simpleMode ? '👤 Advanced' : '👤 Simple';
    btn.title = simpleMode ? 'Show advanced modules' : 'Hide advanced modules';
  }
}

/* ---------- Module collapse ---------- */
function toggleModule(idOrEl) {
  const module = typeof idOrEl === 'string' ? $(idOrEl) : (idOrEl && idOrEl.parentElement);
  if (!module) return;
  const content = module.querySelector('.module-content');
  const icon = module.querySelector('.collapse-icon');
  if (module.classList.contains('collapsed')) {
    module.classList.remove('collapsed');
    if (content) content.style.display = 'block';
    if (icon) icon.textContent = '▾';
    if (module.id === 'm-cfusage') updateCountdown(true);
    if (module.id === 'm-network') scheduleNetworkInfoLoad({ delayMs: 0 });
  } else {
    module.classList.add('collapsed');
    if (content) content.style.display = 'none';
    if (icon) icon.textContent = '▸';
  }
  saveModuleStates();
}

function toggleNetworkModule() {
  const module = $('m-network');
  if (!module) return;
  const content = $('network-module-content');
  const icon = module.querySelector('.collapse-icon');
  const wasCollapsed = module.classList.contains('collapsed') || (content && content.style.display === 'none');
  if (wasCollapsed) {
    module.classList.remove('collapsed');
    if (content) content.style.display = 'block';
    if (icon) icon.textContent = '▾';
    if (!networkInfoLoaded) scheduleNetworkInfoLoad({ delayMs: 0 });
    startLatencyTest();
  } else {
    module.classList.add('collapsed');
    if (content) content.style.display = 'none';
    if (icon) icon.textContent = '▸';
    stopLatencyTest();
  }
}

function saveModuleStates() {
  const states = {};
  document.querySelectorAll('.module').forEach((module) => {
    if (module.id === 'm-network' || module.id === 'm-logs' || !module.id) return;
    states[module.id] = !module.classList.contains('collapsed');
  });
  localStorage.setItem('adminModuleStates', JSON.stringify(states));
}

function loadModuleStates() {
  const saved = localStorage.getItem('adminModuleStates');
  const states = saved ? JSON.parse(saved) : {};
  document.querySelectorAll('.module').forEach((module) => {
    if (module.id === 'm-network') return; // network starts collapsed, lazy loads
    if (module.id === 'm-logs') { module.classList.add('collapsed'); return; }
    const savedState = states[module.id];
    if (savedState === undefined) return; // keep first-visit defaults from HTML
    const isCollapsed = !savedState;
    const content = module.querySelector('.module-content');
    const icon = module.querySelector('.collapse-icon');
    if (isCollapsed && !module.classList.contains('collapsed')) {
      module.classList.add('collapsed');
      if (content) content.style.display = 'none';
      if (icon) icon.textContent = '▸';
    } else if (!isCollapsed && module.classList.contains('collapsed')) {
      module.classList.remove('collapsed');
      if (content) content.style.display = 'block';
      if (icon) icon.textContent = '▾';
    }
  });
}

/* ---------- Modified sections / buttons ---------- */
function markModified(section) {
  if (!modifiedSections.has(section)) modifiedSections.add(section);
  updateButtonStates();
}

function updateButtonStates() {
  const map = {
    sub: { save: 'saveSubBtn', cancel: 'cancelSubBtn' },
    config: { save: 'saveConfigBtn', cancel: 'cancelConfigBtn' },
    ech: { save: 'saveEchBtn', cancel: 'cancelEchBtn' },
    proxy: { save: 'saveProxyBtn', cancel: 'cancelProxyBtn' },
    convert: { save: 'saveConvertBtn', cancel: 'cancelConvertBtn' },
    notification: { save: 'saveNotificationBtn', cancel: 'cancelNotificationBtn' }
  };
  for (const [section, ids] of Object.entries(map)) {
    const saveBtn = $(ids.save);
    const cancelBtn = $(ids.cancel);
    const modified = modifiedSections.has(section);
    if (saveBtn) {
      saveBtn.disabled = !modified;
      saveBtn.classList.toggle('btn-dirty', modified);
    }
    if (cancelBtn) {
      cancelBtn.disabled = !modified;
      cancelBtn.classList.toggle('btn-dirty', modified);
    }
  }
}

/* ---------- Config load / save ---------- */
async function loadConfig() {
  try {
    const response = await fetch('/admin/config.json?_t=' + Date.now(), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) {
      if (window.location.pathname.startsWith('/dashboard')) {
        window.location.href = '/login';
        return;
      }
      throw new Error('failed to load config');
    }
    currentConfig = await response.json();
    originalConfig = JSON.parse(JSON.stringify(currentConfig));
    renderUI();
    const name = currentConfig['优选订阅生成']?.SUBNAME || 'Surfrpt';
    document.title = `${name} — Dashboard`;
    $('pageTitle').textContent = name + ' Panel';
  } catch (error) {
    showToast('Failed to load config: ' + error.message, 'error');
  }
}

async function saveConfigToServer(section) {
  const endpoint = saveAllMode ? '/admin/saveAll' : '/admin/config.json';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      body: JSON.stringify(currentConfig)
    });
    if (!response.ok) throw new Error('save failed');
    if (saveAllMode) {
      const result = await response.json();
      const results = Array.isArray(result.results) ? result.results : [];
      const synced = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) {
        showToast(`✅ Config saved to this worker + ${synced} linked dashboard${synced === 1 ? '' : 's'}`, 'success');
      } else {
        showToast(`⚠️ Saved locally + ${synced} linked. Failed: ${failed.map(f => f.url || 'unknown').join(', ')}`, 'error');
      }
    } else {
      showToast('✅ Config saved. Refresh your subscription to get the latest nodes!', 'success');
    }
    modifiedSections.delete(section);
    updateButtonStates();
  } catch (error) {
    showToast('😢 ' + error.message + ' — check your network or disable your proxy and retry.', 'error');
  }
}

/* ---------- Save to all linked dashboards ---------- */
let saveAllMode = false;

function setSaveAllMode(enabled) {
  saveAllMode = !!enabled;
  try { localStorage.setItem('saveAllMode', saveAllMode ? '1' : '0'); } catch (_) {}
  const wrap = $('saveAllToggleWrap');
  if (wrap) wrap.classList.toggle('save-all-active', saveAllMode);
  const label = $('saveAllLabel');
  if (label) label.textContent = saveAllMode ? 'Save to all ✓' : 'Save to all';
}

function initSaveAllMode() {
  let saved = false;
  try { saved = localStorage.getItem('saveAllMode') === '1'; } catch (_) {}
  const toggle = $('saveAllToggle');
  if (toggle) toggle.checked = saved;
  setSaveAllMode(saved);
}

/* ---------- Render UI ---------- */
function renderUI() {
  const cfUsage = currentConfig.CF?.Usage;
  const cfModule = $('m-cfusage');
  if (cfUsage && cfUsage.success) {
    cfModule.style.display = 'block';
    updateCFUsageDisplay(cfUsage);
    updateCountdown(true);
  } else {
    cfModule.style.display = 'none';
  }

  const token = currentConfig['优选订阅生成']?.TOKEN;
  const host = window.location.host;
  $('LinkURL').value = currentConfig.LINK || '';
  $('subLink').value = `https://${host}/sub?token=${token}`;
  $('base64Link').value = `https://${host}/sub?token=${token}&b64`;
  $('clashLink').value = `https://${host}/sub?token=${token}&clash`;
  $('singboxLink').value = `https://${host}/sub?token=${token}&sb`;

  const local = currentConfig['优选订阅生成']?.local ?? true;
  const randomIP = currentConfig['优选订阅生成']?.本地IP库?.随机IP ?? true;
  if (!local) {
    $('ipMode').value = 'generator';
    $('generatorURL').value = currentConfig['优选订阅生成']?.SUB || '';
  } else if (randomIP) {
    $('ipMode').value = 'random';
    $('randomCount').value = currentConfig['优选订阅生成']?.本地IP库?.随机数量 || 16;
    if (currentConfig['优选订阅生成']?.本地IP库?.指定端口 !== undefined) {
      $('specifiedPort').value = currentConfig['优选订阅生成'].本地IP库.指定端口;
    }
  } else {
    $('ipMode').value = 'custom';
    loadCustomIPs();
  }
  updateIPMode();

  /* Detailed config */
  $('subNameInput').value = currentConfig['优选订阅生成']?.SUBNAME || '';
  syncSSProtocolSettingsFromConfig();
  $('protocolSelect').value = currentConfig['协议类型'] || 'vless';
  syncTransportSettingsFromConfig();
  onProtocolChange();

  if (currentConfig['跳过证书验证'] !== undefined) {
    $('skipCertCheckbox').checked = currentConfig['跳过证书验证'] || false;
  } else {
    $('skipCertCheckbox').closest('.field-row').style.display = 'none';
  }

  if (currentConfig['Fingerprint'] !== undefined) {
    $('fingerprintSelect').value = currentConfig['Fingerprint'] || 'chrome';
  }

  if (currentConfig['随机路径'] !== undefined) {
    $('randomPathCheckbox').checked = currentConfig['随机路径'] || false;
  } else {
    $('randomPathCheckbox').closest('.field-row').style.display = 'none';
  }

  if (currentConfig['启用0RTT'] !== undefined) {
    $('enable0RTTCheckbox').checked = currentConfig['启用0RTT'] || false;
  } else {
    $('enable0RTTCheckbox').closest('.field-row').style.display = 'none';
  }

  if (currentConfig['TLS分片'] !== undefined) {
    $('tlsFragmentSelect').value = currentConfig['TLS分片'] || '';
  } else {
    $('tlsFragmentSelect').closest('.field-row').style.display = 'none';
  }

  const echModule = $('m-ech');
  if (currentConfig['ECH'] !== undefined) {
    echModule.style.display = 'block';
    $('enableECHCheckbox').checked = currentConfig['ECH'] || false;
    populateEchDNSSelect();
    populateEchSNISelect();
  } else {
    echModule.style.display = 'none';
  }

  applyProxyConfigToForm();

  $('subAPIInput').value = currentConfig['订阅转换配置']?.SUBAPI || '';
  syncSubListOption();
  populateSubConfigSelect();

  /* Notification state */
  const tgToken = currentConfig.TG?.BotToken || currentConfig['通知']?.Telegram?.BotToken;
  const tgChat = currentConfig.TG?.ChatID || currentConfig['通知']?.Telegram?.ChatID;
  const tgCheckbox = $('tgEnabledCheckbox');
  if (tgToken && tgChat) {
    tgCheckbox.disabled = false;
    tgCheckbox.checked = currentConfig.TG?.启用 ?? false;
  } else {
    tgCheckbox.disabled = true;
    tgCheckbox.checked = false;
  }

  modifiedSections.clear();
  updateButtonStates();
  loadModuleStates();
  checkHostsMismatch();

  loadSubConfigData().catch(() => {});
}

/* ---------- CF usage ---------- */
function updateCFUsageDisplay(cfUsage) {
  const workers = cfUsage.workers || 0;
  const pages = cfUsage.pages || 0;
  const total = cfUsage.total || 0;
  const dailyQuota = cfUsage.max || 100000;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('cfPagesValue', pages.toLocaleString());
  set('cfWorkersValue', workers.toLocaleString());
  set('cfTotalValue', total.toLocaleString());
  set('cfMaxValue', dailyQuota.toLocaleString());
  set('cfPercentValue', ((total / dailyQuota) * 100).toFixed(2) + '%');
}

function updateCountdown(forceUpdate = false) {
  const el = $('cfCountdown');
  if (!el) return;
  const module = $('m-cfusage');
  const moduleVisible = !!module && module.style.display !== 'none' && !module.classList.contains('collapsed');
  if (!forceUpdate && (document.hidden || !moduleVisible)) return;

  const now = new Date();
  const nextMidnightUTC = new Date(now);
  nextMidnightUTC.setUTCHours(0, 0, 0, 0);
  nextMidnightUTC.setUTCDate(nextMidnightUTC.getUTCDate() + 1);
  const diff = nextMidnightUTC - now;
  const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
  const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
  const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');
  el.textContent = `Reset in ${hours}:${minutes}:${seconds} (UTC)`;
}

/* ---------- Import Dashboards (shared links) ---------- */
let savedDashboards = [];

async function loadImportLinks() {
  try {
    const response = await fetch('/admin/links.json?_t=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) {
      showToast('Failed to load saved dashboards', 'error');
      return;
    }
    const data = await response.json();
    savedDashboards = Array.isArray(data) ? data.filter(d => d && d.url) : [];
    renderSavedDashboards();
  } catch (error) {
    showToast('Failed to load saved dashboards: ' + error.message, 'error');
  }
}

function renderSavedDashboards() {
  const list = $('savedDashboardsList');
  if (!list) return;
  if (savedDashboards.length === 0) {
    list.innerHTML = '<div class="saved-dashboard-empty">No dashboards saved yet.</div>';
    return;
  }
  list.innerHTML = '';
  savedDashboards.forEach((item, index) => {
    const name = item.name || friendlyDashboardName(item.url);
    const row = document.createElement('div');
    row.className = 'saved-dashboard-item';
    row.innerHTML =
      '<span class="db-name">' + escapeHtml(name) + '</span>' +
      '<span class="db-url">' + escapeHtml(item.url) + '</span>' +
      '<span class="db-actions">' +
      '  <button type="button" onclick="openSavedDashboard(' + index + ')">🔗 Open</button>' +
      '  <button type="button" onclick="removeSavedDashboard(' + index + ')">🗑</button>' +
      '</span>';
    list.appendChild(row);
  });
}

function friendlyDashboardName(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const port = u.port ? ':' + u.port : '';
    return host + port;
  } catch (e) {
    return url;
  }
}

function openSavedDashboard(index) {
  const item = savedDashboards[index];
  if (!item || !item.url) return;
  window.location.href = item.url;
}

function addImportLink() {
  const input = $('importLinkInput');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) { showToast('Paste a dashboard URL first', 'error'); return; }
  let url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    new URL(url);
  } catch (e) {
    showToast('Invalid URL: ' + raw, 'error');
    return;
  }
  if (savedDashboards.some(d => d.url === url)) { showToast('This dashboard is already saved', 'info'); return; }
  savedDashboards.push({ name: friendlyDashboardName(url), url, addedAt: Date.now() });
  input.value = '';
  renderSavedDashboards();
  showToast('Dashboard added. Click Save to persist across all workers.', 'info');
}

function removeSavedDashboard(index) {
  savedDashboards.splice(index, 1);
  renderSavedDashboards();
}

async function saveImportLinks() {
  try {
    const response = await fetch('/admin/links.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      body: JSON.stringify({ links: savedDashboards })
    });
    if (!response.ok) throw new Error('save failed');
    const result = await response.json();
    savedDashboards = Array.isArray(result.links) ? result.links : savedDashboards;
    renderSavedDashboards();
    showToast('✅ Saved dashboards shared across all workers', 'success');
  } catch (error) {
    showToast('😢 ' + error.message + ' — could not save dashboards.', 'error');
  }
}

/* ---------- Copy & QR ---------- */
function copyField(id) {
  const el = $(id);
  if (!el || !el.value) return;
  const text = el.value;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ Copied to clipboard', 'success'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('✅ Copied to clipboard', 'success');
  } catch (e) {
    showToast('❌ Copy failed', 'error');
  }
  document.body.removeChild(ta);
}

function showQRCode(elementId) {
  const el = $(elementId);
  if (!el || !el.value) return;
  const container = $('qrcodeContainer');
  const errorEl = $('qrcodeError');
  container.innerHTML = '';
  if (errorEl) errorEl.classList.add('hidden');
  $('qrcodeModal').classList.add('show');
  if (typeof QRCode !== 'undefined') {
    new QRCode(container, { text: el.value, width: 220, height: 220 });
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'qr-fallback';
    fallback.textContent = el.value;
    container.appendChild(fallback);
  }
}

/* ---------- Subscription generator ---------- */
function updateIPMode() {
  const mode = $('ipMode').value;
  const map = { random: 'randomIPSection', custom: 'customIPSection', generator: 'generatorSection' };
  for (const [key, id] of Object.entries(map)) {
    const el = $(id);
    if (el) el.style.display = (key === mode) ? 'block' : 'none';
  }
  $('specifiedPortRow').style.display = (mode === 'random') ? 'block' : 'none';
  $('btnChainProxy').closest('.module-actions').style.display = (mode === 'custom') ? 'flex' : 'none';
  markModified('sub');
}

function extractDomain(url) {
  let value = String(url || '').trim();
  if (!value) return '';
  try {
    if (!value.includes('://')) value = 'https://' + value;
    const parsed = new URL(value);
    return parsed.hostname;
  } catch (e) {
    return value;
  }
}

function processGeneratorURL() {
  const input = $('generatorURL');
  const value = input.value.trim();
  if (value) {
    input.value = extractDomain(value);
  }
  markModified('sub');
}

async function loadCustomIPs() {
  const textarea = $('customIPs');
  textarea.disabled = true;
  textarea.value = 'Loading…';
  try {
    const response = await fetch('/admin/ADD.txt?_t=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    textarea.value = response.ok ? await response.text() : '';
  } catch (error) {
    textarea.value = '';
  } finally {
    textarea.disabled = false;
  }
}

async function saveSub() {
  const mode = $('ipMode').value;
  if (mode === 'random' && !$('randomCount').value.trim()) {
    showToast('Random preferred count cannot be empty', 'error');
    return;
  }
  if (mode === 'custom' && !$('customIPs').value.trim()) {
    showToast('Custom preferred IP list cannot be empty', 'error');
    return;
  }
  if (mode === 'generator' && !$('generatorURL').value.trim()) {
    showToast('Generator URL cannot be empty', 'error');
    return;
  }

  const subGen = currentConfig['优选订阅生成'] || {};
  const updates = {
    local: mode !== 'generator',
    本地IP库: { 随机IP: mode === 'random', 随机数量: parseInt($('randomCount').value) || 16 },
    SUB: mode === 'generator' ? $('generatorURL').value : null,
    SUBNAME: subGen.SUBNAME,
    SUBUpdateTime: subGen.SUBUpdateTime,
    TOKEN: subGen.TOKEN
  };
  if (subGen['本地IP库']?.['指定端口'] !== undefined) {
    updates['本地IP库']['指定端口'] = parseInt($('specifiedPort').value);
  }
  currentConfig['优选订阅生成'] = { ...subGen, ...updates };

  if (mode === 'custom') {
    try {
      await fetch('/admin/ADD.txt', { method: 'POST', body: $('customIPs').value });
    } catch (error) {
      showToast('Failed to save custom IPs', 'error');
      return;
    }
  }
  await saveConfigToServer('sub');
}

/* ---------- Detailed config ---------- */
function syncSSProtocolSettingsFromConfig() {
  const protocolSelect = $('protocolSelect');
  for (const p of PANEL_PROTOCOLS) {
    if (!protocolSelect.querySelector('option[value="' + p + '"]')) {
      const option = document.createElement('option');
      option.value = p;
      option.textContent = PANEL_PROTOCOLS_LABELS[p] || p;
      protocolSelect.appendChild(option);
    }
  }
  if (currentConfig && currentConfig.SS && typeof currentConfig.SS === 'object') {
    $('ssMethodSelect').value = currentConfig.SS['加密方式'] || 'aes-128-gcm';
    $('ssTLSSelect').value = currentConfig.SS.TLS ? 'true' : 'false';
  } else {
    if (protocolSelect.value === 'ss') protocolSelect.value = 'vless';
  }
}

function syncTransportSettingsFromConfig() {
  const transportRow = $('transportSelect').closest('.field-row');
  const grpcModeRow = $('grpcModeRow');
  const grpcUaRow = $('grpcUaRow');
  transportRow.style.display = '';
  $('transportSelect').value = currentConfig['传输协议'] || 'ws';
  if (!PANEL_TRANSPORTS.includes($('transportSelect').value)) {
    $('transportSelect').value = 'ws';
  }
  $('grpcModeSelect').value = currentConfig['gRPC模式'] || 'gun';
  if (currentConfig['gRPCUserAgent'] !== undefined) {
    grpcUaRow.style.display = '';
    $('grpcUaInput').value = currentConfig['gRPCUserAgent'] || '';
  } else {
    grpcUaRow.style.display = 'none';
  }
  updateGrpcModeVisibility();
  updatePathFieldVisibility();
}

function updatePathFieldVisibility() {
  const transport = $('transportSelect').value;
  const pathRow = $('pathRow');
  if (!pathRow) return;
  const usesPath = ['ws', 'grpc', 'http', 'xhttp', 'splithttp'].includes(transport);
  pathRow.style.display = usesPath ? '' : 'none';
  const label = pathRow.querySelector('label');
  if (label) label.textContent = transport === 'grpc' ? 'Service Name' : 'Path';
}

function updateGrpcModeVisibility() {
  const isGrpc = $('transportSelect').value === 'grpc';
  $('grpcModeRow').style.display = isGrpc ? '' : 'none';
  const grpcUaRow = $('grpcUaRow');
  if (grpcUaRow && currentConfig['gRPCUserAgent'] !== undefined) {
    grpcUaRow.style.display = isGrpc ? '' : 'none';
  }
}

function onTransportChange() {
  updateGrpcModeVisibility();
  updatePathFieldVisibility();
  markModified('config');
}

let pendingSSTLS = null;

function onSSTLSChange() {
  const select = $('ssTLSSelect');
  if (select.value === 'false') {
    pendingSSTLS = 'false';
    select.value = 'true';
    $('ssTLSDisableModal').classList.add('show');
    return;
  }
  markModified('config');
}

function confirmDisableSSTLS() {
  $('ssTLSDisableModal').classList.remove('show');
  if (pendingSSTLS === 'false') {
    $('ssTLSSelect').value = 'false';
  }
  pendingSSTLS = null;
  markModified('config');
}

function cancelDisableSSTLS() {
  $('ssTLSDisableModal').classList.remove('show');
  $('ssTLSSelect').value = 'true';
  pendingSSTLS = null;
}

function onProtocolChange() {
  const protocol = $('protocolSelect').value;
  const showSSFields = protocol === 'ss';
  $('ssSection').style.display = showSSFields ? '' : 'none';
  $('ssTLSRow').style.display = showSSFields ? '' : 'none';
  if (protocol === 'ss') {
    $('transportSelect').value = 'ws';
  }
  $('transportSelect').disabled = protocol === 'ss';
  updateGrpcModeVisibility();
  updatePathFieldVisibility();
  updateECHOptionState();
  markModified('config');
}

function onPathChange() {
  markModified('config');
}

function saveConfig() {
  const subGen = currentConfig['优选订阅生成'] || {};
  subGen.SUBNAME = $('subNameInput').value;
  currentConfig['优选订阅生成'] = subGen;
  currentConfig['协议类型'] = $('protocolSelect').value;

  if ($('protocolSelect').value === 'ss') {
    if (!currentConfig.SS || typeof currentConfig.SS !== 'object') {
      currentConfig.SS = {};
    }
    currentConfig.SS['加密方式'] = $('ssMethodSelect').value || 'aes-128-gcm';
    currentConfig.SS.TLS = $('ssTLSSelect').value === 'true';
  }
  currentConfig['传输协议'] = $('transportSelect').value;
  currentConfig['gRPC模式'] = $('grpcModeSelect').value || 'gun';
  if (currentConfig['gRPCUserAgent'] !== undefined) {
    const uaValue = $('grpcUaInput').value.replace(/\s+/g, '');
    currentConfig['gRPCUserAgent'] = uaValue ? $('grpcUaInput').value : (navigator.userAgent || '');
  }
  currentConfig['跳过证书验证'] = $('skipCertCheckbox').checked;
  if (currentConfig['Fingerprint'] !== undefined) {
    currentConfig['Fingerprint'] = $('fingerprintSelect').value;
  }
  if (currentConfig['随机路径'] !== undefined) {
    currentConfig['随机路径'] = $('randomPathCheckbox').checked;
  }
  if (currentConfig['启用0RTT'] !== undefined) {
    currentConfig['启用0RTT'] = $('enable0RTTCheckbox').checked;
  }
  if (currentConfig['TLS分片'] !== undefined) {
    currentConfig['TLS分片'] = $('tlsFragmentSelect').value || null;
  }
  saveConfigToServer('config');
}

/* ---------- ECH ---------- */
function updateECHOptionState() {
  const fingerprint = $('fingerprintSelect').value;
  const protocol = $('protocolSelect').value;
  const ssTLS = $('ssTLSSelect').value;
  const supported = ['chrome', 'firefox'].includes(fingerprint);
  const ssNoTLS = protocol === 'ss' && ssTLS === 'false';
  const shouldDisable = !supported || ssNoTLS;
  const enableCheckbox = $('enableECHCheckbox');
  if (shouldDisable && enableCheckbox.checked) {
    enableCheckbox.checked = false;
  }
}

function populateEchDNSSelect() {
  const select = $('echDNSSelect');
  const saved = currentConfig.ECHConfig?.DNS;
  select.innerHTML = '';
  for (const opt of echDNSOptions) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  }
  const custom = $('echDNSCustom');
  const hidden = $('echDNSValue');
  if (saved) {
    const matched = echDNSOptions.some(o => o.value === saved);
    if (matched) {
      select.value = saved;
      custom.style.display = 'none';
      hidden.value = saved;
    } else {
      select.value = 'custom';
      custom.value = saved;
      custom.style.display = 'block';
      hidden.value = saved;
    }
  } else {
    select.value = echDNSOptions[0].value;
    custom.style.display = 'none';
    hidden.value = echDNSOptions[0].value;
  }
}

function onEchDNSSelectChange() {
  const select = $('echDNSSelect');
  const custom = $('echDNSCustom');
  const hidden = $('echDNSValue');
  if (select.value === 'custom') {
    custom.style.display = 'block';
    hidden.value = custom.value.trim();
  } else {
    custom.style.display = 'none';
    hidden.value = select.value;
  }
  markModified('ech');
}

function populateEchSNISelect() {
  const select = $('echSNISelect');
  const saved = currentConfig.ECHConfig?.SNI;
  select.innerHTML = '';
  for (const opt of echSNIOptions) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  }
  const custom = $('echSNICustom');
  const hidden = $('echSNIValue');
  if (saved) {
    const matched = echSNIOptions.some(o => o.value === saved);
    if (matched) {
      select.value = saved;
      custom.style.display = 'none';
      hidden.value = saved;
    } else {
      select.value = 'custom';
      custom.value = saved;
      custom.style.display = 'block';
      hidden.value = saved;
    }
  } else {
    select.value = echSNIOptions[0].value;
    custom.style.display = 'none';
    hidden.value = echSNIOptions[0].value;
  }
}

function onEchSNISelectChange() {
  const select = $('echSNISelect');
  const custom = $('echSNICustom');
  const hidden = $('echSNIValue');
  if (select.value === 'custom') {
    custom.style.display = 'block';
    hidden.value = custom.value.trim();
  } else {
    custom.style.display = 'none';
    hidden.value = select.value;
  }
  markModified('ech');
}

function saveEch() {
  if (currentConfig['ECH'] !== undefined) {
    currentConfig['ECH'] = $('enableECHCheckbox').checked;
    if (currentConfig.ECHConfig?.DNS !== undefined) {
      const dnsValue = $('echDNSValue').value;
      if (dnsValue) currentConfig.ECHConfig.DNS = dnsValue;
    }
    if (currentConfig.ECHConfig?.SNI !== undefined) {
      const sniValue = $('echSNIValue').value;
      currentConfig.ECHConfig.SNI = sniValue === '' ? null : sniValue;
    }
  }
  saveConfigToServer('ech');
}

/* ---------- Proxy ---------- */
function getSelectedProxyProtocol() {
  return $('proxyModeSelect').value;
}

function getEffectiveProxyMode() {
  const mode = $('proxyModeSelect').value;
  if (mode === 'auto') return 'auto';
  return PROXY_PROTOCOLS.includes(mode) ? mode : 'auto';
}

function setProxyModeSelection(mode) {
  if (mode === 'auto') $('proxyModeSelect').value = 'auto';
  else if (PROXY_PROTOCOLS.includes(mode)) $('proxyModeSelect').value = mode;
}

function applyProxyConfigToForm() {
  const socksEnabled = currentConfig['反代']?.SOCKS5?.启用;
  const proxyIPValue = currentConfig['反代']?.PROXYIP || '';
  if (!socksEnabled) {
    setProxyModeSelection('auto');
    $('proxyIPInput').value = proxyIPValue;
    $('autoProxyCheckbox').checked = proxyIPValue === 'auto';
    $('proxyIPInput').disabled = proxyIPValue === 'auto';
  } else {
    setProxyModeSelection(socksEnabled);
    populateProxyProtocolFromConfig(socksEnabled);
  }
  updateProxyMode(false, false);
}

function getProxyAddressFieldId(protocol) {
  return { socks5: 'socks5Addr', http: 'httpAddr', https: 'httpsAddr', turn: 'turnAddr', sstp: 'sstpAddr' }[protocol] || 'socks5Addr';
}

function getProxyGlobalFieldId(protocol) {
  return { socks5: 'globalSocks5', http: 'globalHTTP', https: 'globalHTTPS', turn: 'globalTURN', sstp: 'globalSSTP' }[protocol] || 'globalSocks5';
}

function getProxySectionId(protocol) {
  return { socks5: 'socks5Section', http: 'httpSection', https: 'httpsSection', turn: 'turnSection', sstp: 'sstpSection' }[protocol] || 'socks5Section';
}

function populateProxyProtocolFromConfig(protocol) {
  const addressFieldId = getProxyAddressFieldId(protocol);
  const globalFieldId = getProxyGlobalFieldId(protocol);
  $(addressFieldId).value = currentConfig['反代']?.SOCKS5?.账号 || '';
  $(globalFieldId).checked = currentConfig['反代']?.SOCKS5?.全局 || false;
  if (protocol === 'socks5' && currentConfig['反代']?.SOCKS5?.白名单 !== undefined) {
    const whitelist = currentConfig['反代'].SOCKS5['白名单'];
    $('socks5Whitelist').value = Array.isArray(whitelist) ? whitelist.join('\n') : (whitelist || '');
  }
}

function updateProxyMode(markSectionModified = true, populateFromConfig = true) {
  const mode = getEffectiveProxyMode();
  const isAuto = mode === 'auto';
  $('autoSection').style.display = isAuto ? '' : 'none';
  for (const protocol of PROXY_PROTOCOLS) {
    const section = $(getProxySectionId(protocol));
    section.style.display = (mode === protocol) ? '' : 'none';
  }
  if (populateFromConfig) {
    if (isAuto) {
      const proxyIPValue = currentConfig['反代']?.PROXYIP || '';
      $('proxyIPInput').value = proxyIPValue;
      $('autoProxyCheckbox').checked = proxyIPValue === 'auto';
      $('proxyIPInput').disabled = proxyIPValue === 'auto';
    } else {
      populateProxyProtocolFromConfig(mode);
    }
  }
  if (markSectionModified) markModified('proxy');
}

function onAutoProxyChange() {
  const checked = $('autoProxyCheckbox').checked;
  $('proxyIPInput').disabled = checked;
  markModified('proxy');
}

function normalizeProxyProtocol(protocol) {
  return PROXY_PROTOCOLS.includes(protocol) ? protocol : 'socks5';
}

function processProxyAddressForValidation(input, type) {
  let value = String(input || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  for (const protocol of PROXY_PROTOCOLS) {
    const prefixes = [`${protocol}://`, `${protocol}=`];
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix)) {
        value = value.slice(prefix.length);
        break;
      }
    }
  }
  return value;
}

async function verifyProxy(proxyType) {
  const addressFieldId = getProxyAddressFieldId(proxyType);
  const address = $(addressFieldId).value.trim();
  const statusEl = $('proxyVerifyStatus');
  if (!address) {
    showToast('Please enter a proxy address first', 'error');
    return;
  }
  const processed = processProxyAddressForValidation(address, proxyType);
  if (!processed) {
    showToast('Invalid proxy address format', 'error');
    return;
  }
  $('proxyVerifyModal').classList.add('show');
  $('btnConfirmProxyAddress').disabled = true;
  statusEl.innerHTML = '<div class="status-box status-box-loading">⏳ Verifying…</div>';

  try {
    const params = new URLSearchParams();
    params.append(proxyType, processed);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(`/admin/check?${params}&_t=${Date.now()}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();

    if (!data || typeof data !== 'object' || !('success' in data)) {
      statusEl.innerHTML = '<div class="status-box status-box-error">❌ <strong>Backend version too old</strong><br>Please update edgetunnel.</div>';
    } else if (data.success === false) {
      statusEl.innerHTML = `<div class="status-box status-box-error">❌ <strong>Proxy invalid</strong><br>${escapeHtml(data.error || 'Unknown error')}</div>`;
    } else {
      const ip = data.ip || 'unknown';
      const loc = data.loc || 'unknown';
      const rt = data.responseTime ? data.responseTime + 'ms' : 'unknown';
      statusEl.innerHTML = `
        <div class="status-box status-box-ok">
          <div class="status-box-title"><span class="pulse-dot"></span> Connection secured</div>
          <div class="status-box-row"><span>Region</span><strong>${escapeHtml(loc)}</strong></div>
          <div class="status-box-row"><span>IP</span><strong>${escapeHtml(ip)}</strong></div>
          <div class="status-box-row"><span>Response</span><strong>${escapeHtml(rt)}</strong></div>
        </div>`;
      const btn = $('btnConfirmProxyAddress');
      btn.disabled = false;
      btn.dataset.validAddress = processed;
      btn.dataset.validType = proxyType;
    }
  } catch (error) {
    statusEl.innerHTML = `<div class="status-box status-box-error">❌ <strong>Verification ${error.name === 'AbortError' ? 'timed out' : 'failed'}</strong><br>${escapeHtml(error.message)}</div>`;
  }
}

function confirmProxyAddress() {
  const btn = $('btnConfirmProxyAddress');
  const validAddress = btn.dataset.validAddress;
  const validType = btn.dataset.validType;
  if (!validAddress || !validType) return;
  const addressFieldId = getProxyAddressFieldId(validType);
  $(addressFieldId).value = validAddress;
  if (validType === 'socks5' && $('socks5Addr').value.includes('@')) {
    // address kept as-is; whitelist unchanged
  }
  setProxyModeSelection(validType);
  updateProxyMode(false, false);
  markModified('proxy');
  $('proxyVerifyModal').classList.remove('show');
  showToast('✅ Proxy address set', 'success');
}

async function saveProxy() {
  const mode = getEffectiveProxyMode();
  let socksEnabled = null;
  let socksAccount = '';
  let globalProxy = false;
  let proxyIP = currentConfig['反代']?.PROXYIP;

  if (mode === 'auto') {
    const autoProxy = $('autoProxyCheckbox').checked;
    proxyIP = autoProxy ? 'auto' : $('proxyIPInput').value.trim();
    if (!autoProxy && !proxyIP) {
      showToast('ProxyIP address cannot be empty', 'error');
      return;
    }
  } else {
    socksEnabled = mode;
    socksAccount = $(getProxyAddressFieldId(mode)).value.trim();
    globalProxy = $(getProxyGlobalFieldId(mode)).checked;
    if (!socksAccount) {
      showToast(`${mode.toUpperCase()} address cannot be empty`, 'error');
      return;
    }
  }

  let whitelist = null;
  if (mode === 'socks5' && currentConfig['反代']?.SOCKS5?.['白名单'] !== undefined) {
    whitelist = $('socks5Whitelist').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  const existing = currentConfig['反代'] || {};
  const existingSocks5 = existing.SOCKS5 || {};
  currentConfig['反代'] = {
    ...existing,
    PROXYIP: proxyIP,
    SOCKS5: {
      ...existingSocks5,
      启用: socksEnabled,
      全局: globalProxy,
      账号: socksAccount,
      白名单: whitelist !== null ? whitelist : existingSocks5['白名单']
    }
  };
  await saveConfigToServer('proxy');
}

/* ---------- Path templates ---------- */
async function showPathTemplateConfigModal() {
  $('pathTemplateModal').classList.add('show');
  pathTemplateOriginal = JSON.parse(JSON.stringify(currentConfig['反代']?.路径模板 || {}));
  await loadPathTemplatePresets();
  const tmpl = currentConfig['反代']?.路径模板 || {};
  $('proxyIPTemplateInput').value = '/' + (tmpl.PROXYIP || '');
  $('socks5StandardTemplateInput').value = '/' + (tmpl.SOCKS5?.标准 || '');
  $('socks5GlobalTemplateInput').value = '/' + (tmpl.SOCKS5?.全局 || '');
  $('httpStandardTemplateInput').value = '/' + (tmpl.HTTP?.标准 || '');
  $('httpGlobalTemplateInput').value = '/' + (tmpl.HTTP?.全局 || '');
  $('presetTemplateSelect').value = 'custom';
  onPathTemplateInput();
}

async function loadPathTemplatePresets() {
  try {
    const text = await fetchWithAutoMirror(PATH_TEMPLATES_URL, 'Path template config');
    pathTemplatePresets = JSON.parse(text);
    const select = $('presetTemplateSelect');
    while (select.options.length > 1) select.remove(1);
    pathTemplatePresets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset['项目名'];
      option.textContent = preset['项目名'];
      select.appendChild(option);
    });
  } catch (error) {
    showToast('Failed to load presets: ' + error.message, 'error');
  }
}

function onPresetTemplateChange() {
  const selected = $('presetTemplateSelect').value;
  if (selected === 'custom') return;
  const preset = pathTemplatePresets.find(p => p['项目名'] === selected);
  if (!preset) return;
  showToast(preset['提示消息'] || 'Template applied', 'info');
  const tmpl = preset['路径模板'];
  $('proxyIPTemplateInput').value = '/' + (tmpl.PROXYIP || '');
  $('socks5StandardTemplateInput').value = '/' + (tmpl.SOCKS5?.标准 || '');
  $('socks5GlobalTemplateInput').value = '/' + (tmpl.SOCKS5?.全局 || '');
  $('httpStandardTemplateInput').value = '/' + (tmpl.HTTP?.标准 || '');
  $('httpGlobalTemplateInput').value = '/' + (tmpl.HTTP?.全局 || '');
  onPathTemplateInput();
}

function onPathTemplateInput() {
  const values = [
    $('proxyIPTemplateInput').value.replace(/^\//, ''),
    $('socks5StandardTemplateInput').value.replace(/^\//, ''),
    $('socks5GlobalTemplateInput').value.replace(/^\//, ''),
    $('httpStandardTemplateInput').value.replace(/^\//, ''),
    $('httpGlobalTemplateInput').value.replace(/^\//, '')
  ];
  const changed = values.some((v, i) => {
    const original = [
      pathTemplateOriginal.PROXYIP || '',
      pathTemplateOriginal.SOCKS5?.标准 || '',
      pathTemplateOriginal.SOCKS5?.全局 || '',
      pathTemplateOriginal.HTTP?.标准 || '',
      pathTemplateOriginal.HTTP?.全局 || ''
    ][i];
    return v !== original;
  });
  $('pathTemplateSaveBtn').disabled = !changed;
  markModified('proxy');
}

async function savePathTemplateConfig() {
  const tmpl = {
    PROXYIP: $('proxyIPTemplateInput').value.replace(/^\//, ''),
    SOCKS5: {
      标准: $('socks5StandardTemplateInput').value.replace(/^\//, ''),
      全局: $('socks5GlobalTemplateInput').value.replace(/^\//, '')
    },
    HTTP: {
      标准: $('httpStandardTemplateInput').value.replace(/^\//, ''),
      全局: $('httpGlobalTemplateInput').value.replace(/^\//, '')
    }
  };
  if (!currentConfig['反代']) currentConfig['反代'] = {};
  currentConfig['反代'].路径模板 = tmpl;
  await saveConfigToServer('proxy');
  $('pathTemplateModal').classList.remove('show');
}

/* ---------- Subscription convert ---------- */
function syncSubListOption() {
  const conv = currentConfig['订阅转换配置'] || {};
  const fields = [
    ['subListRow', 'subList', 'SUBLIST'],
    ['udpRow', 'udp', 'UDP'],
    ['xudpRow', 'xudp', 'XUDP'],
    ['tls13Row', 'tls13', 'TLS13'],
    ['appendTypeRow', 'appendType', 'APPEND_TYPE'],
    ['sortRow', 'sort', 'SORT']
  ];
  for (const [rowId, checkboxId, key] of fields) {
    const row = $(rowId);
    const checkbox = $(checkboxId);
    if (conv[key] !== undefined) {
      row.style.display = '';
      checkbox.checked = conv[key] || false;
    } else {
      row.style.display = 'none';
      checkbox.checked = false;
    }
  }
}

async function loadSubConfigData() {
  try {
    const text = await fetchWithAutoMirror(SUBCONFIG_URL, 'SubConfig');
    subConfigData = JSON.parse(text);
  } catch (error) {
    subConfigData = null;
  }
  populateSubConfigSelect();
}

function populateSubConfigSelect() {
  const select = $('subConfigSelect');
  const customInput = $('subConfigCustomInput');
  select.innerHTML = '<option value="custom">Custom</option>';
  if (subConfigData && Array.isArray(subConfigData)) {
    subConfigData.forEach(group => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      if (group.options && Array.isArray(group.options)) {
        group.options.forEach(option => {
          const opt = document.createElement('option');
          opt.value = option.value;
          opt.textContent = option.label;
          optgroup.appendChild(opt);
        });
      }
      select.appendChild(optgroup);
    });
  }
  const saved = currentConfig['订阅转换配置']?.SUBCONFIG || '';
  if (saved) {
    select.value = saved;
    if (select.value !== saved) {
      select.value = 'custom';
      customInput.value = saved;
      customInput.style.display = 'block';
    } else {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  } else {
    select.value = 'custom';
    customInput.style.display = 'block';
  }
}

function onSubConfigSelectChange() {
  const select = $('subConfigSelect');
  const customInput = $('subConfigCustomInput');
  if (select.value === 'custom') {
    customInput.style.display = 'block';
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
  markModified('convert');
}

function onSubConfigCustomInput() {
  markModified('convert');
}

async function saveConvert() {
  const conv = currentConfig['订阅转换配置'] || {};
  const updates = {
    SUBAPI: $('subAPIInput').value,
    SUBCONFIG: $('subConfigSelect').value === 'custom' ? $('subConfigCustomInput').value : $('subConfigSelect').value,
    SUBEMOJI: conv.SUBEMOJI || false
  };
  const fields = [['SUBLIST', 'subList'], ['UDP', 'udp'], ['XUDP', 'xudp'], ['TLS13', 'tls13'], ['APPEND_TYPE', 'appendType'], ['SORT', 'sort']];
  for (const [key, checkboxId] of fields) {
    if (conv[key] !== undefined) {
      updates[key] = $(checkboxId).checked;
    }
  }
  currentConfig['订阅转换配置'] = { ...conv, ...updates };
  await saveConfigToServer('convert');
}

/* ---------- SubAPI modal ---------- */
function normalizeSubAPIURL(url) {
  let value = String(url || '').trim();
  if (!value) return '';
  if (!value.includes('://')) value = 'https://' + value;
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch (e) {
    return '';
  }
}

async function openSubAPIModal() {
  $('subApiStatus').innerHTML = '';
  $('btnConfirmSubAPI').disabled = true;
  $('subApiModal').classList.add('show');
  const currentValue = $('subAPIInput').value;
  const select = $('subApiSelect');
  select.innerHTML = '<option value="">-- loading… --</option>';
  try {
    const jsonText = await fetchWithAutoMirror(SUBAPI_LIST_URL, 'SUBAPI list');
    const apiList = JSON.parse(jsonText);
    select.innerHTML = '';
    apiList.forEach(item => {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = `${item.label} [${item.value}]`;
      select.appendChild(option);
    });
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = '🔧 Custom';
    select.appendChild(customOption);
    if (currentValue && currentValue.trim()) {
      const matched = Array.from(select.options).find(opt => opt.value.toLowerCase() === currentValue.trim().toLowerCase());
      if (matched) {
        select.value = matched.value;
        $('subApiCustomRow').style.display = 'none';
      } else {
        select.value = 'custom';
        $('subApiCustomInput').value = currentValue.trim();
        $('subApiCustomRow').style.display = 'block';
      }
    } else {
      select.value = '';
      $('subApiCustomRow').style.display = 'none';
    }
  } catch (error) {
    select.innerHTML = '<option value="custom">🔧 Custom</option>';
    select.value = 'custom';
    $('subApiCustomInput').value = currentValue.trim();
    $('subApiCustomRow').style.display = 'block';
  }
}

function handleSubAPISelectChange() {
  const select = $('subApiSelect');
  if (select.value === 'custom') {
    $('subApiCustomRow').style.display = 'block';
  } else {
    $('subApiCustomRow').style.display = 'none';
    $('subApiCustomInput').value = select.value;
  }
  $('subApiStatus').innerHTML = '';
  $('btnConfirmSubAPI').disabled = true;
}

async function testSubAPI() {
  const select = $('subApiSelect');
  const input = select.value === 'custom' ? $('subApiCustomInput').value.trim() : select.value.trim();
  if (!input) {
    $('subApiStatus').innerHTML = '<div class="status-box status-box-error">❌ Please enter an address</div>';
    return;
  }
  const baseURL = normalizeSubAPIURL(input);
  if (!baseURL) {
    $('subApiStatus').innerHTML = '<div class="status-box status-box-error">❌ Invalid address format</div>';
    return;
  }
  $('subApiStatus').innerHTML = '<div class="status-box status-box-loading">⏳ Testing…</div>';
  $('btnConfirmSubAPI').disabled = true;
  try {
    const response = await fetch(baseURL + '/version');
    if (response.status === 200) {
      const content = await response.text();
      if (content.toLowerCase().includes('subconverter')) {
        $('subApiStatus').innerHTML = `<div class="status-box status-box-ok">✅ ${escapeHtml(content)}</div>`;
        const btn = $('btnConfirmSubAPI');
        btn.disabled = false;
        btn.dataset.validURL = baseURL;
      } else {
        $('subApiStatus').innerHTML = '<div class="status-box status-box-error">❌ Invalid response content</div>';
      }
    } else {
      $('subApiStatus').innerHTML = `<div class="status-box status-box-error">❌ Request failed (HTTP ${response.status})</div>`;
    }
  } catch (error) {
    $('subApiStatus').innerHTML = `<div class="status-box status-box-error">❌ Test failed: ${escapeHtml(error.message)}</div>`;
  }
}

function confirmSubAPI() {
  const validURL = $('btnConfirmSubAPI').dataset.validURL;
  if (!validURL) return;
  $('subAPIInput').value = validURL;
  markModified('convert');
  $('subApiModal').classList.remove('show');
  showToast('✅ SubConvert API set', 'success');
}

/* ---------- Notifications (Telegram + Cloudflare) ---------- */
function openTelegramConfigModal() {
  const tg = currentConfig.TG || currentConfig['通知']?.Telegram || {};
  $('telegramTokenInput').value = tg.BotToken || '';
  $('telegramChatIDInput').value = tg.ChatID || '';
  $('telegramTestStatus').innerHTML = '';
  $('btnConfirmTelegram').disabled = true;
  $('telegramConfigModal').classList.add('show');
}

async function testTelegramConfig() {
  const token = $('telegramTokenInput').value.trim();
  const chatID = $('telegramChatIDInput').value.trim();
  const statusEl = $('telegramTestStatus');
  const bases = ['https://api.telegram.org', 'https://api.tg.090227.xyz'];

  async function requestTelegram(endpoint, params = null, preferredBase = null) {
    const order = preferredBase ? [preferredBase, ...bases.filter(b => b !== preferredBase)] : bases;
    const errors = [];
    for (const base of order) {
      const queryString = params ? '?' + params.toString() : '';
      try {
        const response = await fetch(`${base}/bot${token}/${endpoint}${queryString}`);
        const data = await response.json();
        if (!response.ok && data && data.ok === false) return { data, base };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { data, base };
      } catch (error) {
        errors.push(`${new URL(base).hostname}: ${error.message}`);
      }
    }
    throw new Error(`All APIs failed (${errors.join('; ')})`);
  }

  if (!token || !chatID) {
    statusEl.innerHTML = '<div class="status-box status-box-error">❌ Please fill in Bot Token and Chat ID</div>';
    return;
  }
  statusEl.innerHTML = '<div class="status-box status-box-loading">⏳ Verifying…</div>';
  $('btnConfirmTelegram').disabled = true;
  try {
    const getMe = await requestTelegram('getMe');
    if (!getMe.data.ok) throw new Error('Invalid Bot Token: ' + (getMe.data.description || 'unknown'));
    const params = new URLSearchParams({ chat_id: chatID, text: '✅ Telegram notification config verified!' });
    const send = await requestTelegram('sendMessage', params, getMe.base);
    if (!send.data.ok) throw new Error('Invalid Chat ID: ' + (send.data.description || 'unknown'));
    statusEl.innerHTML = '<div class="status-box status-box-ok">✅ Bot Token and Chat ID are valid</div>';
    $('btnConfirmTelegram').disabled = false;
  } catch (error) {
    statusEl.innerHTML = `<div class="status-box status-box-error">❌ Verification failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function confirmTelegramConfig() {
  const token = $('telegramTokenInput').value.trim();
  const chatID = $('telegramChatIDInput').value.trim();
  if ($('btnConfirmTelegram').disabled) {
    showToast('Please verify the config first', 'error');
    return;
  }
  try {
    const response = await fetch('/admin/tg.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ BotToken: token, ChatID: chatID })
    });
    if (response.ok) {
      showToast('✅ Telegram config saved', 'success');
      $('telegramConfigModal').classList.remove('show');
      currentConfig.TG = { BotToken: token, ChatID: chatID, 启用: true };
      const checkbox = $('tgEnabledCheckbox');
      checkbox.disabled = false;
      checkbox.checked = true;
      setTimeout(() => location.reload(), 1000);
    } else {
      const errorData = await response.json();
      showToast('❌ Save failed: ' + (errorData.error || 'unknown'), 'error');
    }
  } catch (error) {
    showToast('❌ Save failed: ' + error.message, 'error');
  }
}

function openClearTelegramModal() {
  $('clearTelegramModal').classList.add('show');
}

async function confirmClearTelegramConfig() {
  try {
    const response = await fetch('/admin/tg.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init: true })
    });
    const data = await response.json();
    if (response.ok && data.success) {
      $('clearTelegramModal').classList.remove('show');
      showToast('✅ Telegram config cleared. Reloading…', 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      showToast('❌ Clear failed: ' + (data.message || 'unknown'), 'error');
    }
  } catch (error) {
    showToast('❌ Clear failed: ' + error.message, 'error');
  }
}

function openCloudflareConfigModal() {
  $('cloudflareConfigModal').classList.add('show');
  $('cfAuthMethod').value = 'accountid';
  $('cfEmailInput').value = '';
  $('cfGlobalKeyInput').value = '';
  $('cfAccountIDInput').value = '';
  $('cfAPITokenInput').value = '';
  $('cfUsageAPIInput').value = '';
  $('cfTestStatus').innerHTML = '';
  $('btnConfirmCloudflare').disabled = true;
  updateCloudflareAuthMethod();
}

function updateCloudflareAuthMethod() {
  const method = $('cfAuthMethod').value;
  $('cloudflareEmailSection').style.display = method === 'email' ? 'block' : 'none';
  $('cloudflareAccountIDSection').style.display = method === 'accountid' ? 'block' : 'none';
  $('cloudflareUsageAPISection').style.display = method === 'usageapi' ? 'block' : 'none';
  $('cfTestStatus').innerHTML = '';
  $('btnConfirmCloudflare').disabled = true;
}

async function testCloudflareConfig() {
  const method = $('cfAuthMethod').value;
  const statusEl = $('cfTestStatus');
  const confirmBtn = $('btnConfirmCloudflare');
  let email = '', globalKey = '', accountID = '', apiToken = '', usageAPI = '';
  if (method === 'email') {
    email = $('cfEmailInput').value.trim();
    globalKey = $('cfGlobalKeyInput').value.trim();
    if (!email || !globalKey) {
      statusEl.innerHTML = '<div class="status-box status-box-error">❌ Please fill in Email and Global API Key</div>';
      return;
    }
  } else if (method === 'accountid') {
    accountID = $('cfAccountIDInput').value.trim();
    apiToken = $('cfAPITokenInput').value.trim();
    if (!accountID || !apiToken) {
      statusEl.innerHTML = '<div class="status-box status-box-error">❌ Please fill in Account ID and API Token</div>';
      return;
    }
  } else {
    usageAPI = $('cfUsageAPIInput').value.trim();
    if (!usageAPI) {
      statusEl.innerHTML = '<div class="status-box status-box-error">❌ Please fill in Usage API URL</div>';
      return;
    }
  }
  statusEl.innerHTML = '<div class="status-box status-box-loading">⏳ Testing…</div>';
  confirmBtn.disabled = true;
  try {
    let response;
    if (method === 'usageapi') {
      response = await fetch(usageAPI);
    } else {
      const params = new URLSearchParams();
      if (method === 'email') {
        params.append('Email', email);
        params.append('GlobalAPIKey', globalKey);
      } else {
        params.append('AccountID', accountID);
        params.append('APIToken', apiToken);
      }
      response = await fetch('/admin/getCloudflareUsage?' + params.toString());
    }
    if (!response.ok) throw new Error('Request failed (HTTP ' + response.status + ')');
    const data = await response.json();
    if (data.success) {
      const maxQuota = data.max || 100000;
      const percentage = (data.total / maxQuota * 100).toFixed(2);
      statusEl.innerHTML = `<div class="status-box status-box-ok">✅ Verified! Today's quota: ${Number(data.total).toLocaleString()}/${Number(maxQuota).toLocaleString()} (${percentage}%)</div>`;
      confirmBtn.disabled = false;
      confirmBtn.dataset.method = method;
      confirmBtn.dataset.email = email;
      confirmBtn.dataset.globalAPIKey = globalKey;
      confirmBtn.dataset.accountID = accountID;
      confirmBtn.dataset.apiToken = apiToken;
      confirmBtn.dataset.usageAPI = usageAPI;
    } else {
      statusEl.innerHTML = `<div class="status-box status-box-error">❌ Verification failed: ${escapeHtml(data.msg || 'invalid credentials')}</div>`;
    }
  } catch (error) {
    statusEl.innerHTML = `<div class="status-box status-box-error">❌ Test failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function confirmCloudflareConfig() {
  const btn = $('btnConfirmCloudflare');
  if (btn.disabled) {
    showToast('Please verify the config first', 'error');
    return;
  }
  const method = btn.dataset.method;
  const email = btn.dataset.email || '';
  const globalKey = btn.dataset.globalAPIKey || '';
  const accountID = btn.dataset.accountID || '';
  const apiToken = btn.dataset.apiToken || '';
  const usageAPI = btn.dataset.usageAPI || '';
  const payload = method === 'usageapi'
    ? { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: usageAPI }
    : {
        Email: method === 'email' ? email : null,
        GlobalAPIKey: method === 'email' ? globalKey : null,
        AccountID: method === 'accountid' ? accountID : null,
        APIToken: method === 'accountid' ? apiToken : null,
        UsageAPI: null
      };
  try {
    const response = await fetch('/admin/cf.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      showToast('✅ Cloudflare config saved', 'success');
      $('cloudflareConfigModal').classList.remove('show');
      setTimeout(() => location.reload(), 1000);
    } else {
      const errorData = await response.json();
      showToast('❌ Save failed: ' + (errorData.error || 'unknown'), 'error');
      btn.disabled = false;
    }
  } catch (error) {
    showToast('❌ Save failed: ' + error.message, 'error');
    btn.disabled = false;
  }
}

function openClearCloudflareModal() {
  $('clearCloudflareModal').classList.add('show');
}

async function confirmClearCloudflareConfig() {
  try {
    const response = await fetch('/admin/cf.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init: true })
    });
    const data = await response.json();
    if (response.ok && data.success) {
      $('clearCloudflareModal').classList.remove('show');
      showToast('✅ Cloudflare config cleared. Reloading…', 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      showToast('❌ Clear failed: ' + (data.message || 'unknown'), 'error');
    }
  } catch (error) {
    showToast('❌ Clear failed: ' + error.message, 'error');
  }
}

async function saveNotification() {
  if (!currentConfig.TG) currentConfig.TG = {};
  currentConfig.TG['启用'] = $('tgEnabledCheckbox').checked;
  await saveConfigToServer('notification');
}

/* ---------- Logs ---------- */
function loadLogsOnExpand() {
  const module = $('m-logs');
  if (!module.classList.contains('collapsed') && !logsLoaded) {
    loadLogs();
  }
}

async function loadLogs() {
  try {
    const response = await fetch('/admin/log.json?_t=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!response.ok) throw new Error('failed to load logs');
    const logs = await response.json();
    logsLoaded = true;
    const recentLogs = logs.sort((a, b) => b.TIME - a.TIME).slice(0, 6);
    const container = $('logsList');
    if (!recentLogs.length) {
      container.innerHTML = '<div class="empty-state">No log records</div>';
      return;
    }
    const isMobile = window.innerWidth <= 768;
    let html = '<table class="logs-table"><thead><tr>';
    if (isMobile) {
      html += '<th>Time (UTC+8)</th><th>IP</th><th>Action</th>';
    } else {
      html += '<th>Time (UTC+8)</th><th>IP</th><th>Region</th><th>Action</th>';
    }
    html += '</tr></thead><tbody>';
    recentLogs.forEach(log => {
      const logType = translateLogType(log.TYPE, log.UA);
      const cc = log.CC || 'unknown';
      const timeStr = formatTime(log.TIME);
      const ip = log.IP || 'unknown';
      if (isMobile) {
        html += `<tr><td>${timeStr}</td><td class="mono">${ip}</td><td><span class="log-badge" style="background:${logType.color}">${logType.text}</span></td></tr>`;
      } else {
        html += `<tr><td>${timeStr}</td><td class="mono">${ip}</td><td>${cc}</td><td><span class="log-badge" style="background:${logType.color}">${logType.text}</span></td></tr>`;
      }
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (error) {
    $('logsList').innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load logs: ${escapeHtml(error.message)}</div>`;
  }
}

async function showAllLogs() {
  try {
    const response = await fetch('/admin/log.json?_t=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!response.ok) throw new Error('failed to load logs');
    const logs = await response.json();
    const sortedLogs = logs.sort((a, b) => b.TIME - a.TIME);
    const tbody = $('logsTableBody');
    tbody.innerHTML = '';
    if (!sortedLogs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No log records</td></tr>';
      $('logsModal').classList.add('show');
      return;
    }
    sortedLogs.forEach(log => {
      const logType = translateLogType(log.TYPE, log.UA);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${formatTime(log.TIME)}</td>
        <td class="mono">${escapeHtml(log.IP || 'unknown')}</td>
        <td>${escapeHtml(log.CC || 'unknown')}</td>
        <td class="mono">${escapeHtml(log.ASN || 'unknown')}</td>
        <td><span class="log-badge" style="background:${logType.color}">${logType.text}</span></td>
        <td class="word-break">${escapeHtml(log.URL || 'none')}</td>
        <td class="word-break dim">${escapeHtml((log.UA || 'none').substring(0, 60))}</td>`;
      tbody.appendChild(row);
    });
    $('logsModal').classList.add('show');
  } catch (error) {
    showToast('Failed to load logs: ' + error.message, 'error');
  }
}

/* ---------- Reset / Hosts ---------- */
function openResetModal() {
  $('resetModal').classList.add('show');
}

async function confirmReset() {
  try {
    const response = await fetch('/admin/config.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init: true })
    });
    if (response.ok) {
      $('resetModal').classList.remove('show');
      showToast('✅ Config reset. Reloading…', 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      showToast('❌ Reset failed', 'error');
    }
  } catch (error) {
    showToast('❌ Reset failed: ' + error.message, 'error');
  }
}

function openHostsEditModal() {
  const hosts = Array.isArray(currentConfig.HOSTS) && currentConfig.HOSTS.length
    ? currentConfig.HOSTS.join('\n')
    : (currentConfig.HOST || '');
  $('hostsTextarea').value = hosts;
  $('hostsEditModal').classList.add('show');
}

async function confirmHostsEdit() {
  const lines = $('hostsTextarea').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  currentConfig.HOSTS = lines;
  await saveConfigToServer('config');
  $('hostsEditModal').classList.remove('show');
}

function checkHostsMismatch() {
  const currentHostname = window.location.hostname;
  const hosts = currentConfig.HOSTS || [];
  const isInArray = hosts.some(host => String(host).split(':')[0] === currentHostname);
  if (!isInArray && hosts.length > 0 && shouldShowHostsMismatchNotification()) {
    showHostsMismatchNotification(currentHostname, hosts);
  }
}

function shouldShowHostsMismatchNotification() {
  const cached = localStorage.getItem('hostsMismatchNotificationTime');
  if (!cached) return true;
  return (Date.now() - parseInt(cached, 10)) > 24 * 60 * 60 * 1000;
}

function showHostsMismatchNotification(currentHostname, hosts) {
  const overlay = $('hostsMismatchModal');
  if (!overlay) return;
  const currentEl = $('currentHostname');
  const hostsEl = $('currentHosts');
  if (currentEl) currentEl.textContent = currentHostname;
  if (hostsEl) {
    hostsEl.innerHTML = '';
    hosts.forEach(host => {
      const badge = document.createElement('span');
      badge.className = 'hosts-badge';
      badge.textContent = host;
      hostsEl.appendChild(badge);
    });
  }
  overlay.classList.add('show');
}

function dismissHostsMismatchNotification() {
  localStorage.setItem('hostsMismatchNotificationTime', String(Date.now()));
  $('hostsMismatchModal')?.classList.remove('show');
}

/* ---------- Chain proxy ---------- */
function getDefaultChainProxyHost() {
  return String(window.location.hostname || '').trim();
}

function openChainProxyModal() {
  if (!chainProxyFeatureEnabled) {
    showToast('Current backend version does not support chain proxy', 'error');
    return;
  }
  $('chainProxyNodeName').value = '';
  $('chainProxyHost').value = getDefaultChainProxyHost();
  $('chainProxyPort').value = '';
  $('chainProxyProtocol').value = 'socks5';
  $('chainProxyAddress').value = '';
  $('chainProxyStatus').innerHTML = '';
  $('btnAddChainProxy').disabled = true;
  $('chainProxyModal').classList.add('show');
  resetChainProxyValidation();
}

function resetChainProxyValidation() {
  $('btnAddChainProxy').disabled = true;
  $('chainProxyStatus').innerHTML = '';
  updateChainProxyVerifyState();
}

function updateChainProxyVerifyState() {
  const verifyBtn = $('btnVerifyChainProxy');
  if (verifyBtn) verifyBtn.disabled = !$('chainProxyAddress').value.trim();
}

function sanitizeChainProxyAddressInput() {
  const input = $('chainProxyAddress');
  const protocolSelect = $('chainProxyProtocol');
  let value = input.value.trimStart();
  const lower = value.toLowerCase();
  for (const protocol of PROXY_PROTOCOLS) {
    const prefixes = [`${protocol}://`, `${protocol}=`];
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix)) {
        protocolSelect.value = protocol;
        value = value.slice(prefix.length).trimStart();
        input.value = value;
        break;
      }
    }
  }
  resetChainProxyValidation();
}

function getChainProxyValidationKey(protocol, address) {
  return `${protocol}:${address}`;
}

function buildChainProxyDefaultNodeName(loc, protocol) {
  const region = String(loc || 'unknown').trim();
  return region ? `Chain ${protocol.toUpperCase()} (${region})` : `Chain ${protocol.toUpperCase()}`;
}

function normalizeChainProxyPreferredHost(host) {
  const clean = String(host || '').trim();
  const colonCount = (clean.match(/:/g) || []).length;
  if (colonCount > 1 && !clean.startsWith('[') && !clean.endsWith(']')) {
    return `[${clean}]`;
  }
  return clean;
}

function buildChainProxyPreferredEndpoint(host, port) {
  return port ? `${host}:${port}` : host;
}

function showChainProxyStatus(html) {
  const el = $('chainProxyStatus');
  if (el) el.innerHTML = html;
}

async function verifyChainProxyAvailability() {
  const protocol = normalizeProxyProtocol($('chainProxyProtocol').value);
  const input = $('chainProxyAddress').value.trim();
  const addBtn = $('btnAddChainProxy');
  if (!input) {
    showChainProxyStatus('<div class="status-box status-box-error">❌ Please enter the chain proxy address</div>');
    return;
  }
  const processed = processProxyAddressForValidation(input, protocol);
  if (!processed) {
    showChainProxyStatus('<div class="status-box status-box-error">❌ Invalid chain proxy address format</div>');
    return;
  }
  const validationKey = getChainProxyValidationKey(protocol, processed);
  addBtn.disabled = true;
  $('btnVerifyChainProxy').disabled = true;
  showChainProxyStatus('<div class="status-box status-box-loading">⏳ Verifying…</div>');
  try {
    const params = new URLSearchParams();
    params.append(protocol, processed);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(`/admin/check?${params}&_t=${Date.now()}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!data || typeof data !== 'object' || !('success' in data)) {
      showChainProxyStatus('<div class="status-box status-box-error">❌ <strong>Backend version too old</strong><br>Please update edgetunnel.</div>');
      return;
    }
    if (data.success === false) {
      showChainProxyStatus(`<div class="status-box status-box-error">❌ <strong>Proxy invalid</strong><br>${escapeHtml(data.error || 'unknown')}</div>`);
      return;
    }
    if (validationKey !== getChainProxyValidationKey(normalizeProxyProtocol($('chainProxyProtocol').value), processProxyAddressForValidation($('chainProxyAddress').value.trim(), $('chainProxyProtocol').value))) {
      showChainProxyStatus('<div class="status-box status-box-info">ℹ️ Chain proxy content changed — please re-verify</div>');
      return;
    }
    const ip = data.ip || 'unknown';
    const loc = data.loc || 'unknown';
    const rt = data.responseTime ? data.responseTime + 'ms' : 'unknown';
    const defaultNodeName = buildChainProxyDefaultNodeName(loc, protocol);
    const nodeNameInput = $('chainProxyNodeName');
    if (!nodeNameInput.value.trim()) nodeNameInput.placeholder = defaultNodeName;
    showChainProxyStatus(`
      <div class="status-box status-box-ok">
        <div class="status-box-title"><span class="pulse-dot"></span> Connection secured</div>
        <div class="status-box-row"><span>Region</span><strong>${escapeHtml(loc)}</strong></div>
        <div class="status-box-row"><span>IP</span><strong>${escapeHtml(ip)}</strong></div>
        <div class="status-box-row"><span>Response</span><strong>${escapeHtml(rt)}</strong></div>
      </div>`);
    addBtn.disabled = false;
    addBtn.dataset.validProtocol = protocol;
    addBtn.dataset.validAddress = processed;
    addBtn.dataset.validKey = validationKey;
    addBtn.dataset.defaultNodeName = defaultNodeName;
  } catch (error) {
    showChainProxyStatus(`<div class="status-box status-box-error">❌ <strong>${error.name === 'AbortError' ? 'Verification timed out' : 'Verification failed'}</strong><br>${escapeHtml(error.message)}</div>`);
  } finally {
    $('btnVerifyChainProxy').disabled = false;
  }
}

function addChainProxyNode() {
  const addBtn = $('btnAddChainProxy');
  const validProtocol = addBtn.dataset.validProtocol || '';
  const validAddress = addBtn.dataset.validAddress || '';
  const protocol = normalizeProxyProtocol($('chainProxyProtocol').value);
  const address = processProxyAddressForValidation($('chainProxyAddress').value.trim(), protocol);
  if (!validProtocol || !validAddress) {
    showToast('Please verify the chain proxy first', 'error');
    return;
  }
  if (addBtn.dataset.validKey !== getChainProxyValidationKey(protocol, address)) {
    showToast('Chain proxy content changed — please re-verify', 'error');
    resetChainProxyValidation();
    return;
  }
  const nodeName = String($('chainProxyNodeName').value || '').replace(/[\r\n]+/g, ' ').trim() || addBtn.dataset.defaultNodeName || buildChainProxyDefaultNodeName('', validProtocol);
  const preferredHost = normalizeChainProxyPreferredHost($('chainProxyHost').value || getDefaultChainProxyHost());
  const portValue = $('chainProxyPort').value.trim();
  const portNumber = portValue ? Number(portValue) : null;
  if (!preferredHost) {
    showChainProxyStatus('<div class="status-box status-box-error">❌ Preferred host cannot be empty</div>');
    return;
  }
  if (portValue && (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)) {
    showChainProxyStatus('<div class="status-box status-box-error">❌ Preferred port must be 1–65535</div>');
    return;
  }
  const chainProxyURL = `${validProtocol}://${validAddress}`;
  const preferredEndpoint = buildChainProxyPreferredEndpoint(preferredHost, portNumber);
  const line = `${preferredEndpoint}#${nodeName}$${chainProxyURL}`;
  const textarea = $('customIPs');
  const current = textarea.value.trim();
  textarea.value = current ? `${current}\n${line}` : line;
  markModified('sub');
  $('chainProxyModal').classList.remove('show');
  showToast('✅ Chain proxy node appended to custom preferred list', 'success');
}

/* ---------- API Optimize (subscription interface) ---------- */
function openAPIOptimizeModal() {
  $('apiOptimizeURL').value = '';
  $('apiOptimizePort').value = '443';
  $('apiOptimizeResults').value = '';
  $('useProxyIPCheckbox').checked = false;
  $('btnAppendAPI').disabled = true;
  $('btnAppendResults').disabled = true;
  $('apiOptimizeModal').classList.add('show');
}

function closeAPIOptimizeModal() {
  $('apiOptimizeModal').classList.remove('show');
}

function convertGitHubURLToRaw(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'github.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[2] === 'blob') {
        parts.splice(2, 1);
        parsed.hostname = 'raw.githubusercontent.com';
        parsed.pathname = '/' + parts.join('/');
        parsed.search = '';
        return parsed.toString();
      }
    }
  } catch (e) { /* ignore */ }
  return url;
}

function isValidURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function validateAndNormalizePort(port) {
  const num = parseInt(port, 10);
  if (Number.isInteger(num) && num >= 1 && num <= 65535) return String(num);
  return '443';
}

function autoConvertGitHubURL() {
  const urlInput = $('apiOptimizeURL');
  const url = urlInput.value.trim();
  if (url.includes('github.com/')) {
    const converted = convertGitHubURLToRaw(url);
    if (converted !== url) urlInput.value = converted;
  }
}

function autoDetectPortFromURL() {
  const urlInput = $('apiOptimizeURL').value.trim();
  if (!urlInput) return;
  try {
    const urlObj = new URL(urlInput);
    const portParam = urlObj.searchParams.get('port');
    if (portParam) {
      $('apiOptimizePort').value = validateAndNormalizePort(portParam);
    }
  } catch (e) { /* ignore */ }
}

async function verifyAPIOptimize() {
  let urlInput = $('apiOptimizeURL').value.trim();
  const portInput = $('apiOptimizePort').value.trim();
  if (!urlInput) {
    showToast('Please enter an API URL', 'error');
    return;
  }
  const converted = convertGitHubURLToRaw(urlInput);
  if (converted !== urlInput) {
    $('apiOptimizeURL').value = converted;
    urlInput = converted;
    showToast('✅ GitHub link converted to raw format', 'info');
  }
  if (!isValidURL(urlInput)) {
    showToast('Please enter a valid URL', 'error');
    return;
  }
  let detectedPort = null;
  let cleanURL = urlInput;
  try {
    const urlObj = new URL(urlInput);
    const portParam = urlObj.searchParams.get('port');
    if (portParam) {
      detectedPort = validateAndNormalizePort(portParam);
      urlObj.searchParams.delete('port');
      cleanURL = urlObj.toString();
      $('apiOptimizeURL').value = cleanURL;
      $('apiOptimizePort').value = detectedPort;
      showToast(`✅ Auto-detected port: ${detectedPort}`, 'success');
    }
  } catch (e) { /* ignore */ }

  const normalizedPort = detectedPort || validateAndNormalizePort(portInput);
  $('apiOptimizePort').value = normalizedPort;

  const urlObj = new URL(cleanURL);
  urlObj.searchParams.set('port', normalizedPort);
  const useProxyIP = $('useProxyIPCheckbox').checked;
  if (useProxyIP) urlObj.searchParams.set('proxyip', 'true');
  const completeURL = urlObj.toString();
  const encodedURL = encodeURIComponent(completeURL);
  const requestURL = `/admin/getADDAPI?url=${encodedURL}`;

  const resultsTA = $('apiOptimizeResults');
  try {
    const response = await fetch(requestURL);
    const data = await response.json();
    if (data.success && data.data && Array.isArray(data.data)) {
      resultsTA.value = data.data.join('\n');
      $('btnAppendAPI').disabled = false;
      $('btnAppendResults').disabled = false;
      showToast('✅ API interface verified!', 'success');
    } else {
      resultsTA.value = '❌ API unavailable — check URL and port';
      $('btnAppendAPI').disabled = true;
      $('btnAppendResults').disabled = true;
      showToast('❌ API verification failed', 'error');
    }
  } catch (error) {
    resultsTA.value = `❌ Verification error: ${error.message}`;
    $('btnAppendAPI').disabled = true;
    $('btnAppendResults').disabled = true;
    showToast('❌ Verification failed, try again later', 'error');
  }
}

function appendAPIToCustom() {
  let urlInput = $('apiOptimizeURL').value.trim();
  const portInput = $('apiOptimizePort').value.trim();
  const useProxyIP = $('useProxyIPCheckbox').checked;
  if (!urlInput) {
    showToast('Please enter an API URL', 'error');
    return;
  }
  try {
    const urlObj = new URL(urlInput);
    urlObj.searchParams.delete('port');
    urlObj.searchParams.delete('proxyip');
    urlInput = urlObj.toString();
  } catch (e) { /* ignore */ }
  const urlObj = new URL(urlInput);
  urlObj.searchParams.set('port', portInput);
  if (useProxyIP) urlObj.searchParams.set('proxyip', 'true');
  const completeURL = urlObj.toString();
  const textarea = $('customIPs');
  const current = textarea.value.trim();
  textarea.value = current ? `${current}\n${completeURL}` : completeURL;
  markModified('sub');
  showToast('✅ API URL appended to custom preferred list', 'success');
  closeAPIOptimizeModal();
}

function appendResultsToCustom() {
  const results = $('apiOptimizeResults').value.trim();
  if (!results || results.startsWith('❌')) {
    showToast('Please verify the API first', 'error');
    return;
  }
  const textarea = $('customIPs');
  const current = textarea.value.trim();
  textarea.value = current ? `${current}\n${results}` : results;
  markModified('sub');
  showToast('✅ API results appended to custom preferred list', 'success');
  closeAPIOptimizeModal();
}

/* ---------- Online optimize (BestCF iframe) ---------- */
function openOnlineOptimizeModal() {
  const modal = $('onlineOptimizeModal');
  const frame = $('onlineOptimizeFrame');
  if (!modal || !frame) return;
  if (!frame.dataset.loaded) {
    frame.src = './onlineOptimize.html';
    frame.dataset.loaded = 'true';
  }
  modal.classList.add('show');
}

function closeOnlineOptimizeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  $('onlineOptimizeModal')?.classList.remove('show');
}

function appendOnlineOptimizeSelections(lines) {
  if (!Array.isArray(lines) || !lines.length) return;
  const textarea = $('customIPs');
  const current = textarea.value.trim();
  textarea.value = current ? `${current}\n${lines.join('\n')}` : lines.join('\n');
  markModified('sub');
  showToast('✅ Online optimize results appended', 'success');
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'bestcf-save-results' && Array.isArray(data.lines)) {
    appendOnlineOptimizeSelections(data.lines);
  } else if (data.type === 'bestcf-close') {
    closeOnlineOptimizeModal();
  }
});

/* ---------- Proxy explore modals ---------- */
function showExploreModal(type) {
  showExploreProxyModal(type);
}

function showGetMoreProxyIPModal() {
  showExploreProxyModal('proxyip');
  selectedProxyIPs = [];
  updateSelectedProxyIPsUI();
}

function showExploreProxyModal(type) {
  const config = proxyConfigs[type];
  if (!config) return;
  const modal = $(config.modalId);
  if (!modal) return;
  buildExploreModal(type);
  modal.classList.add('show');
  loadProxyList(type);
}

function closeExploreProxyModal(type, event) {
  const config = proxyConfigs[type];
  if (event && event.target.id !== config.modalId) return;
  if (config.abortController) config.abortController.abort();
  config.abortController = null;
  $(config.modalId).classList.remove('show');
}

function buildExploreModal(type) {
  const config = proxyConfigs[type];
  const host = $('exploreModalsHost');
  const existing = $(config.modalId);
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = config.modalId;
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeExploreProxyModal('${type}', event)"></div>
    <div class="modal-panel modal-lg">
      <div class="modal-header">
        <h2>🔍 Browse ${type.toUpperCase()} Proxy list</h2>
        <button type="button" class="modal-close" onclick="closeExploreProxyModal('${type}', event)">×</button>
      </div>
      <div class="modal-body">
        <div class="field-row">
          <label>Region</label>
          <div class="field-control">
            <select id="${config.regionSelectId}" onchange="onProxyRegionChange('${type}')"></select>
          </div>
        </div>
        <div class="field-row" id="${config.proxySelectGroupId}" style="display:none">
          <label>Proxy</label>
          <div class="field-control">
            <select id="${config.proxySelectId}" onchange="onProxySelectChange('${type}')"></select>
          </div>
        </div>
        ${type === 'proxyip' ? `
        <div class="field-row">
          <label>Selected ProxyIPs</label>
          <div class="field-control">
            <div id="selectedProxyIPsContainer" class="selected-proxy-ips"></div>
          </div>
        </div>` : ''}
        <div class="modal-actions">
          <button type="button" id="${config.confirmBtnId}" onclick="confirmExploreProxy('${type}')" disabled>Confirm</button>
          <button type="button" onclick="closeExploreProxyModal('${type}', event)">Cancel</button>
        </div>
        <div id="${type}ExploreStatus"></div>
      </div>
    </div>`;
  host.appendChild(modal);
}

function loadProxyList(type) {
  const config = proxyConfigs[type];
  const select = $(config.regionSelectId);
  if (!select) return;
  select.innerHTML = '<option value="">Loading…</option>';
  fetchWithAutoMirror(config.url, config.description)
    .then(text => {
      let data = JSON.parse(text);
      if (type === 'proxyip') {
        data = data.data.filter(item =>
          Array.isArray(item.port) ? item.port.includes(443) : item.port === 443
        ).map(item => ({
          proxy: item.ip,
          ip: item.ip,
          country: item.meta?.country || 'Unknown',
          country_cn: item.meta?.country_cn || '未知',
          country_en: item.meta?.country_en || 'Unknown',
          country_emoji: item.meta?.country_emoji || '🏳️',
          city: item.meta?.city || '未知',
          clientIp: item.meta?.clientIp || item.ip,
          asn: item.meta?.asn || 0,
          asOrganization: item.meta?.asOrganization || '未知',
          continent: item.meta?.continent || 'Unknown',
          latitude: item.meta?.latitude !== undefined ? item.meta.latitude : (item.meta?.colo?.lat ?? null),
          longitude: item.meta?.longitude !== undefined ? item.meta.longitude : (item.meta?.colo?.lon ?? null)
        }));
      }
      window[config.listData] = data;
      window[config.countryMap] = buildCountryMap(data);
      populateProxyRegionSelect(type);
    })
    .catch(error => {
      select.innerHTML = '<option value="">Load failed</option>';
    });
}

function buildCountryMap(listData) {
  const map = {};
  listData.forEach(item => {
    const country = item.country;
    if (!map[country]) map[country] = [];
    map[country].push(item);
  });
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1].length - a[1].length));
}

function populateProxyRegionSelect(type) {
  const config = proxyConfigs[type];
  const select = $(config.regionSelectId);
  if (!select) return;
  const countryMap = window[config.countryMap];
  let html = '<option value="">-- Choose region --</option>';
  const continentMap = {};
  for (const [country, proxies] of Object.entries(countryMap)) {
    const proxy = proxies[0];
    const continent = proxy.continent || 'Unknown';
    const continentData = continentInfo[continent] || { emoji: '🌍', name: continent };
    if (!continentMap[continent]) {
      continentMap[continent] = { emoji: continentData.emoji, name: continentData.name, countries: {} };
    }
    continentMap[continent].countries[country] = {
      count: proxies.length,
      name: proxy.country_cn || country,
      emoji: proxy.country_emoji || ''
    };
  }
  for (const [continentCode, continentData] of Object.entries(continentMap)) {
    html += `<optgroup label="${continentData.emoji} ${continentData.name} / ${continentCode}">`;
    for (const [country, countryData] of Object.entries(continentData.countries)) {
      html += `<option value="${country}">${countryData.emoji} ${countryData.name} (${countryData.count})</option>`;
    }
    html += '</optgroup>';
  }
  select.innerHTML = html;
}

function onProxyRegionChange(type) {
  const config = proxyConfigs[type];
  const selectedCountry = $(config.regionSelectId).value;
  const confirmBtn = $(config.confirmBtnId);
  if (confirmBtn) confirmBtn.disabled = true;
  if (!selectedCountry) return;
  const proxies = window[config.countryMap][selectedCountry] || [];
  $(config.proxySelectGroupId).style.display = 'block';
  const select = $(config.proxySelectId);
  select.innerHTML = '<option value="">Verifying availability…</option>';

  if (config.abortController) config.abortController.abort();
  config.abortController = new AbortController();

  const status = window[config.verificationStatus] || {};
  proxies.forEach(proxy => {
    if (!status[proxy.proxy]) {
      status[proxy.proxy] = { status: 'pending', responseTime: null };
    }
  });
  window[config.verificationStatus] = status;

  // Begin verifying each proxy in parallel (limited)
  const verifier = config.verifySingleFunction;
  const signal = config.abortController.signal;
  const results = [];
  proxies.forEach(proxy => {
    if (type === 'proxyip') {
      results.push(verifySingleProxyIP(proxy, signal));
    } else {
      results.push(verifySingleProxy(proxy, type, signal));
    }
  });
  Promise.allSettled(results).then(() => {
    populateProxySelect(type, selectedCountry);
  });
  // Show a live populated select as results come in
  setTimeout(() => populateProxySelect(type, selectedCountry), 400);
}

async function verifySingleProxy(proxy, type, signal) {
  const config = proxyConfigs[type];
  const proxyKey = proxy.proxy;
  if (signal && signal.aborted) return;
  const status = window[config.verificationStatus];
  const timeouts = window[config.verificationTimeouts] || (window[config.verificationTimeouts] = {});
  const timeoutId = setTimeout(() => {
    status[proxyKey] = { status: 'timeout', responseTime: null };
    updateProxyDisplay(type);
  }, 10000);
  timeouts[proxyKey] = timeoutId;
  try {
    const response = await fetch(`https://api.090227.xyz/check?${type}=${encodeURIComponent(proxyKey)}`, { signal });
    clearTimeout(timeouts[proxyKey]);
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        status[proxyKey] = { status: 'success', responseTime: data.responseTime };
      } else {
        status[proxyKey] = { status: 'failed', responseTime: null };
      }
    } else {
      status[proxyKey] = { status: 'failed', responseTime: null };
    }
  } catch (error) {
    if (signal && signal.aborted) return;
    clearTimeout(timeouts[proxyKey]);
    status[proxyKey] = { status: 'failed', responseTime: null };
  }
  updateProxyDisplay(type);
}

async function verifySingleProxyIP(proxy, signal) {
  const config = proxyConfigs['proxyip'];
  const proxyKey = proxy.proxy;
  if (signal && signal.aborted) return;
  const status = window[config.verificationStatus];
  const timeouts = window[config.verificationTimeouts] || (window[config.verificationTimeouts] = {});
  const timeoutId = setTimeout(() => {
    status[proxyKey] = { status: 'timeout', responseTime: null };
    updateProxyDisplay('proxyip');
  }, 10000);
  timeouts[proxyKey] = timeoutId;
  try {
    const response = await fetch(`https://api.090227.xyz/check?proxyip=${proxyKey}`, { signal });
    clearTimeout(timeouts[proxyKey]);
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        status[proxyKey] = { status: 'success', responseTime: data.responseTime, supports_ipv4: data.supports_ipv4 === true, supports_ipv6: data.supports_ipv6 === true };
      } else {
        status[proxyKey] = { status: 'failed', responseTime: null };
      }
    } else {
      status[proxyKey] = { status: 'failed', responseTime: null };
    }
  } catch (error) {
    if (signal && signal.aborted) return;
    clearTimeout(timeouts[proxyKey]);
    status[proxyKey] = { status: 'failed', responseTime: null };
  }
  updateProxyDisplay('proxyip');
}

function updateProxyDisplay(type) {
  const config = proxyConfigs[type];
  const select = $(config.proxySelectId);
  if (!select || select.value !== '') return;
  // Re-render options with live status labels
  const selectedCountry = $(config.regionSelectId)?.value;
  if (selectedCountry) populateProxySelect(type, selectedCountry);
}

function statusIcon(status) {
  if (status.status === 'success') return '✅';
  if (status.status === 'failed' || status.status === 'timeout') return '❌';
  return '⏳';
}

function populateProxySelect(type, selectedCountry) {
  const config = proxyConfigs[type];
  const select = $(config.proxySelectId);
  const countryMap = window[config.countryMap];
  const proxies = countryMap[selectedCountry] || [];
  const status = window[config.verificationStatus] || {};
  let html = '<option value="">-- Select proxy --</option>';
  proxies.forEach(proxy => {
    const info = status[proxy.proxy];
    const label = info && info.responseTime != null
      ? `${statusIcon(info)} ${proxy.proxy} — ${info.responseTime}ms`
      : `${statusIcon(info || { status: 'pending' })} ${proxy.proxy}`;
    html += `<option value="${proxy.proxy}">${label}</option>`;
  });
  select.innerHTML = html;
  select.disabled = false;
}

function onProxySelectChange(type) {
  const config = proxyConfigs[type];
  const select = $(config.proxySelectId);
  const confirmBtn = $(config.confirmBtnId);
  if (confirmBtn) {
    confirmBtn.disabled = !select.value;
  }
  if (type === 'proxyip' && select.value) {
    addSelectedProxyIP(select.value);
    select.value = '';
  }
}

function addSelectedProxyIP(ip) {
  if (selectedProxyIPs.length >= 8) {
    showToast('Max 8 ProxyIPs can be selected', 'warning');
    return;
  }
  if (selectedProxyIPs.includes(ip)) {
    showToast('This IP is already in the selection list', 'warning');
    return;
  }
  selectedProxyIPs.push(ip);
  updateSelectedProxyIPsUI();
  updateProxyIPConfirmButton();
}

function removeSelectedProxyIP(ip) {
  selectedProxyIPs = selectedProxyIPs.filter(item => item !== ip);
  updateSelectedProxyIPsUI();
  updateProxyIPConfirmButton();
}

function updateSelectedProxyIPsUI() {
  const container = $('selectedProxyIPsContainer');
  if (!container) return;
  container.innerHTML = '';
  const dataList = window.proxyIPListData || [];
  selectedProxyIPs.forEach(ip => {
    const item = dataList.find(d => d.proxy === ip);
    const emoji = item?.country_emoji || '🏳️';
    const chip = document.createElement('span');
    chip.className = 'proxy-ip-chip';
    chip.textContent = `${emoji} ${ip}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => removeSelectedProxyIP(ip);
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
}

function updateProxyIPConfirmButton() {
  const btn = $('proxyIPConfirmBtn');
  if (btn) btn.disabled = selectedProxyIPs.length === 0;
}

function confirmExploreProxy(type) {
  const config = proxyConfigs[type];
  if (type === 'proxyip') {
    if (!selectedProxyIPs.length) return;
    const current = $('proxyIPInput').value.trim();
    $('proxyIPInput').value = current ? current + ',' + selectedProxyIPs.join(',') : selectedProxyIPs.join(',');
    $('autoProxyCheckbox').checked = false;
    $('proxyIPInput').disabled = false;
    markModified('proxy');
    closeExploreProxyModal('proxyip', null);
    showToast('✅ ProxyIPs set', 'success');
    return;
  }
  const select = $(config.proxySelectId);
  const address = select.value;
  if (!address) return;
  $(config.inputId).value = address;
  setProxyModeSelection(type);
  updateProxyMode(false, false);
  markModified('proxy');
  closeExploreProxyModal(type, null);
  showToast('✅ Proxy address set', 'success');
}

/* ---------- Cancel edit ---------- */
function cancelEdit(section) {
  currentConfig = JSON.parse(JSON.stringify(originalConfig));

  if (section === 'sub') {
    const local = currentConfig['优选订阅生成']?.local ?? true;
    const randomIP = currentConfig['优选订阅生成']?.本地IP库?.随机IP ?? true;
    if (!local) {
      $('ipMode').value = 'generator';
      $('generatorURL').value = currentConfig['优选订阅生成']?.SUB || '';
    } else if (randomIP) {
      $('ipMode').value = 'random';
      $('randomCount').value = currentConfig['优选订阅生成']?.本地IP库?.随机数量 || 16;
      if (currentConfig['优选订阅生成']?.本地IP库?.指定端口 !== undefined) {
        $('specifiedPort').value = currentConfig['优选订阅生成'].本地IP库.指定端口;
      }
    } else {
      $('ipMode').value = 'custom';
      loadCustomIPs();
    }
    updateIPMode();
  } else if (section === 'config') {
    $('subNameInput').value = currentConfig['优选订阅生成']?.SUBNAME || '';
    syncSSProtocolSettingsFromConfig();
    $('protocolSelect').value = currentConfig['协议类型'] || 'vless';
    syncTransportSettingsFromConfig();
    onProtocolChange();
    $('skipCertCheckbox').checked = currentConfig['跳过证书验证'] || false;
    if (currentConfig['Fingerprint'] !== undefined) {
      $('fingerprintSelect').value = currentConfig['Fingerprint'] || 'chrome';
    }
    if (currentConfig['随机路径'] !== undefined) {
      $('randomPathCheckbox').checked = currentConfig['随机路径'] || false;
    }
    if (currentConfig['启用0RTT'] !== undefined) {
      $('enable0RTTCheckbox').checked = currentConfig['启用0RTT'] || false;
    }
    if (currentConfig['TLS分片'] !== undefined) {
      $('tlsFragmentSelect').value = currentConfig['TLS分片'] || '';
    }
    if (currentConfig['ECH'] !== undefined) {
      $('enableECHCheckbox').checked = currentConfig['ECH'] || false;
      populateEchDNSSelect();
      populateEchSNISelect();
    }
  } else if (section === 'ech') {
    if (currentConfig['ECH'] !== undefined) {
      $('enableECHCheckbox').checked = currentConfig['ECH'] || false;
      populateEchDNSSelect();
      populateEchSNISelect();
    }
  } else if (section === 'proxy') {
    applyProxyConfigToForm();
  } else if (section === 'convert') {
    $('subAPIInput').value = currentConfig['订阅转换配置']?.SUBAPI || '';
    syncSubListOption();
    populateSubConfigSelect();
  } else if (section === 'notification') {
    const tgCheckbox = $('tgEnabledCheckbox');
    tgCheckbox.checked = originalConfig.TG?.['启用'] ?? false;
    currentConfig.TG['启用'] = tgCheckbox.checked;
  }

  modifiedSections.delete(section);
  updateButtonStates();
}

/* ---------- Generic modal helpers ---------- */
function openModal(id) {
  $(id)?.classList.add('show');
}

function closeModal(id) {
  $(id)?.classList.remove('show');
}

/* Logout */
function logout() {
  fetch('/logout', { method: 'GET', credentials: 'same-origin' }).catch(() => {});
  window.location.href = '/login';
}

/* ---------- Network info module ---------- */
function setStatus(id, status) {
  const indicator = $(id);
  if (indicator) indicator.className = 'status-indicator status-' + status;
}

function maskNetworkIpValue(ip) {
  const value = String(ip || '').trim();
  if (!value || value === 'unknown') return value;
  if (networkPrivacyVisible) return value;
  if (value.includes('.') && !value.includes(':')) {
    const parts = value.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${'*'.repeat(parts[1].length)}.${'*'.repeat(parts[2].length)}.${'*'.repeat(parts[3].length)}`;
    }
  }
  if (value.includes(':')) {
    const hasBrackets = value.startsWith('[') && value.endsWith(']');
    const pure = hasBrackets ? value.slice(1, -1) : value;
    const firstColon = pure.indexOf(':');
    if (firstColon !== -1) {
      const firstSegment = pure.slice(0, firstColon);
      const masked = firstSegment + ':' + pure.slice(firstColon + 1).replace(/[^:]/g, '*');
      return hasBrackets ? `[${masked}]` : masked;
    }
  }
  return value.length <= 2 ? '*'.repeat(Math.max(2, value.length)) : `${value.slice(0, 2)}${'*'.repeat(value.length - 2)}`;
}

function maskNetworkLocationValue(location) {
  const value = String(location || '').trim();
  if (!value || value === 'unknown') return value;
  if (networkPrivacyVisible) return value;
  return value.split(/\s+/).filter(Boolean).map((token, index) => {
    if (index === 0 && /^[a-zA-Z]{2}$/.test(token)) return token.toUpperCase();
    return '*'.repeat(Math.max(2, token.length));
  }).join(' ');
}

function setNetworkFieldValue(fieldId, value, type) {
  const el = $(fieldId);
  if (!el) return;
  const clean = String(value || '').trim() || 'unknown';
  el.dataset.rawValue = clean;
  el.dataset.displayState = 'ready';
  el.classList.remove('error');
  if (type === 'ip') {
    el.textContent = maskNetworkIpValue(clean);
  } else {
    el.textContent = maskNetworkLocationValue(clean);
  }
  if (networkPrivacyVisible) {
    el.classList.add('privacy-visible');
  } else {
    el.classList.remove('privacy-visible');
  }
}

function setNetworkFieldError(fieldId, message) {
  const el = $(fieldId);
  if (!el) return;
  el.dataset.rawValue = '';
  el.dataset.displayState = 'error';
  el.classList.add('error');
  el.textContent = message;
}

function clearNetworkFieldValue(fieldId) {
  const el = $(fieldId);
  if (!el) return;
  el.dataset.rawValue = '';
  el.dataset.displayState = '';
  el.textContent = '-';
}

function applyNetworkCardFlag() { /* visual placeholder — flags kept simple */ }

function toggleNetworkPrivacy() {
  networkPrivacyVisible = !networkPrivacyVisible;
  document.querySelectorAll('.ip-text').forEach(el => {
    const raw = el.dataset.rawValue || '';
    if (el.dataset.displayState !== 'ready') return;
    el.textContent = networkPrivacyVisible ? raw : (maskNetworkIpValue(raw) + '');
  });
  document.querySelectorAll('.country-text').forEach(el => {
    const raw = el.dataset.rawValue || '';
    if (el.dataset.displayState !== 'ready') return;
    el.textContent = networkPrivacyVisible ? raw : maskNetworkLocationValue(raw);
  });
  showToast(networkPrivacyVisible ? 'Showing real values' : 'Values masked', 'info');
}

function createJsonpRequest(url, callbackParam, timeoutMs = NETWORK_API_TIMEOUT_MS) {
  const controller = new AbortController();
  return {
    cancel: () => controller.abort(),
    promise: new Promise((resolve, reject) => {
      const callbackName = '__jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      const script = document.createElement('script');
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('jsonp timeout'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('jsonp load error'));
      };
      const sep = url.includes('?') ? '&' : '?';
      script.src = `${url}${sep}${callbackParam}=${callbackName}`;
      document.head.appendChild(script);
    })
  };
}

function createIpProbeRequestTask(sourceConfig) {
  if (sourceConfig.type === 'jsonp') {
    const jsonpTask = createJsonpRequest(sourceConfig.url, sourceConfig.callbackParam);
    return {
      cancel: jsonpTask.cancel,
      promise: jsonpTask.promise.then(payload => {
        const requestIp = String(sourceConfig.extractIp(payload) || '').trim();
        if (!requestIp) throw new Error('missing jsonp ip');
        return { source: sourceConfig.url, requestIp, providerName: sourceConfig.name };
      })
    };
  }
  const controller = new AbortController();
  return {
    cancel: () => controller.abort(),
    promise: (async () => {
      const url = `${sourceConfig.url}${sourceConfig.url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
      const response = await fetchWithTimeout(url, {
        method: 'HEAD', cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const requestIp = String(response.headers.get(sourceConfig.ipHeader) || '').trim();
      if (!requestIp) throw new Error(`missing ${sourceConfig.ipHeader}`);
      return { source: sourceConfig.url, requestIp, providerName: sourceConfig.name };
    })()
  };
}

async function raceIpProbeSources(sourceConfigs, label) {
  if (!sourceConfigs.length) throw new Error(`${label} has no sources`);
  const tasks = sourceConfigs.map(createIpProbeRequestTask);
  try {
    return await Promise.any(tasks.map(t => t.promise));
  } finally {
    tasks.forEach(t => t.cancel && t.cancel());
  }
}

async function fetchIpInfoByIp(ip) {
  const requestIp = String(ip || '').trim();
  if (!requestIp) throw new Error('missing ip');
  const response = await fetchWithTimeout(`https://api.090227.xyz/api/ipsb?ip=${encodeURIComponent(requestIp)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('ipinfo HTTP ' + response.status);
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('ipinfo invalid payload');
  return data;
}

function formatIpInfoLocation(info) {
  const countryCode = String(info?.country_code || 'unknown').trim() || 'unknown';
  const rawAsn = info?.asn;
  const asnText = (rawAsn === undefined || rawAsn === null)
    ? ''
    : (/^\d+$/.test(String(rawAsn).trim()) ? `AS${String(rawAsn).trim()}` : String(rawAsn).trim());
  const asnName = String(info?.as_name || info?.asn_organization || info?.organization || info?.isp || '').trim();
  return `${countryCode} ${asnText} ${asnName}`.trim() || 'unknown';
}

function renderNetworkCards() {
  const container = $('networkCardsContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="network-card">
      <div class="network-card-title">
        <span class="status-indicator" id="status-india"></span>
        <div class="title-text">
          <div class="title-main">🇮🇳 India Test</div>
          <div class="title-subtitle">Most used in India</div>
        </div>
      </div>
      <div class="network-info-content">
        <span id="india-ip" class="ip-text">-</span>
        <div class="location-text"><span id="india-country" class="country-text">-</span></div>
        <div id="india-tip" class="network-tip">· The IP you use to visit popular sites in India</div>
      </div>
    </div>
    <div class="network-card">
      <div class="network-card-title">
        <span class="status-indicator" id="status-overseas"></span>
        <div class="title-text">
          <div class="title-main">🌍 Overseas Test</div>
          <div class="title-subtitle">Unblocked Overseas</div>
        </div>
      </div>
      <div class="network-info-content">
        <span id="overseas-ip" class="ip-text">-</span>
        <div class="location-text"><span id="overseas-country" class="country-text">-</span></div>
        <div class="network-tip">· The IP you use to visit unblocked overseas sites</div>
      </div>
    </div>
    <div class="network-card">
      <div class="network-card-title">
        <span class="status-indicator" id="status-cf"></span>
        <div class="title-text">
          <div class="title-main">☁️ CloudFlare</div>
          <div class="title-subtitle" id="cf-subtitle">ProxyIP</div>
        </div>
      </div>
      <div class="network-info-content">
        <span id="cf-ip" class="ip-text">-</span>
        <div class="location-text"><span id="cf-country" class="country-text">-</span></div>
        <div class="network-tip">· The landing IP you use to visit CFCDN sites</div>
      </div>
    </div>
    <div class="network-card">
      <div class="network-card-title">
        <span class="status-indicator" id="status-twitter"></span>
        <div class="title-text">
          <div class="title-main">🚀 Outside Test</div>
          <div class="title-subtitle">Google · X.com</div>
        </div>
      </div>
      <div class="network-info-content">
        <span id="twitter-ip" class="ip-text">-</span>
        <div class="location-text"><span id="twitter-country" class="country-text">-</span></div>
        <div id="twitter-tip" class="network-tip">· The IP you use to visit outside sites</div>
      </div>
    </div>
    <div class="network-actions">
      <button type="button" onclick="toggleNetworkPrivacy()">👁 Toggle IP visibility</button>
    </div>`;
}

async function fetchIndiaTestData() {
  setStatus('status-india', 'loading');
  const statusElement = $('status-india');
  const titleElement = statusElement ? statusElement.parentElement : null;
  const tipElement = $('india-tip');
  const isInvalid = ip => {
    const candidate = String(ip || '').trim();
    return !candidate || candidate === '0.0.0.0';
  };

  const sources = [
    {
      name: 'Google',
      createTask: () => {
        const jsonpTask = createJsonpRequest(`https://jsonp-ip.appspot.com/?_t=${Date.now()}`, 'callback');
        return {
          cancel: jsonpTask.cancel,
          promise: jsonpTask.promise.then(payload => {
            const requestIp = String(payload?.ip || '').trim();
            if (isInvalid(requestIp)) throw new Error('google jsonp invalid ip');
            return { providerName: 'Google', requestIp };
          })
        };
      }
    },
    {
      name: 'X.com',
      createTask: () => {
        const controller = new AbortController();
        return {
          cancel: () => controller.abort(),
          promise: (async () => {
            const response = await fetchWithTimeout(`https://help.x.com/cdn-cgi/trace?_t=${Date.now()}`, {
              cache: 'no-store', signal: controller.signal
            });
            if (!response.ok) throw new Error(`x trace HTTP ${response.status}`);
            const text = await response.text();
            const ipLine = text.split('\n').find(line => line.startsWith('ip='));
            const requestIp = String(ipLine ? ipLine.slice(3) : '').trim();
            if (isInvalid(requestIp)) throw new Error('x trace invalid ip');
            return { providerName: 'X.com', requestIp };
          })()
        };
      }
    },
    {
      name: 'GitHub',
      createTask: () => {
        const controller = new AbortController();
        return {
          cancel: () => controller.abort(),
          promise: (async () => {
            const response = await fetchWithTimeout(`https://github.com/cdn-cgi/trace?_t=${Date.now()}`, {
              cache: 'no-store', signal: controller.signal
            });
            if (!response.ok) throw new Error(`github trace HTTP ${response.status}`);
            const text = await response.text();
            const ipLine = text.split('\n').find(line => line.startsWith('ip='));
            const requestIp = String(ipLine ? ipLine.slice(3) : '').trim();
            if (isInvalid(requestIp)) throw new Error('github trace invalid ip');
            return { providerName: 'GitHub', requestIp };
          })()
        };
      }
    }
  ];

  indiaEntries = [];
  indiaActiveIndex = 0;

  try {
    const settled = await Promise.allSettled(sources.map(async source => {
      const task = source.createTask();
      return { source: source.name, result: await task.promise };
    }));
    const successful = settled
      .filter(item => item.status === 'fulfilled' && item.value && item.value.result)
      .map(item => item.value);
    if (!successful.length) throw new Error('all india sources failed');

    const detailPromises = successful.map(async ({ source, result }) => {
      try {
        const info = await fetchIpInfoByIp(result.requestIp);
        return {
          providerName: result.providerName,
          ip: String(info.ip || result.requestIp || 'unknown').trim(),
          loc: formatIpInfoLocation(info)
        };
      } catch (e) {
        return {
          providerName: result.providerName,
          ip: String(result.requestIp || 'unknown').trim(),
          loc: 'unknown'
        };
      }
    });
    indiaEntries = await Promise.all(detailPromises);
    indiaActiveIndex = 0;
    const activeEntry = indiaEntries[0];
    setNetworkFieldValue('india-ip', activeEntry.ip, 'ip');
    setNetworkFieldValue('india-country', activeEntry.loc || 'unknown', 'location');
    if (tipElement) tipElement.textContent = `· The IP you use to visit ${activeEntry.providerName} in India`;
    if (titleElement) {
      const providers = indiaEntries.map(entry => entry.providerName).join(' · ');
      titleElement.innerHTML = `<span class="status-indicator" id="status-india"></span><div class="title-text"><div class="title-main">🇮🇳 India Test</div><div class="title-subtitle">${providers}</div></div>`;
    }
    setStatus('status-india', 'success');
  } catch (error) {
    setNetworkFieldError('india-ip', 'load failed');
    clearNetworkFieldValue('india-country');
    setStatus('status-india', 'error');
  }
}

async function fetchOverseasTestData() {
  setStatus('status-overseas', 'loading');
  const apis = [
    {
      url: 'https://api.ipapi.is',
      parse: d => ({ ip: d.ip, loc: `${d.location?.country_code || 'unknown'} AS${d.asn?.asn || ''} ${d.asn?.org || ''}`.trim() })
    },
    {
      url: 'https://api.cmliussss.net/api/ipinfo',
      parse: d => ({ ip: d.ip, loc: `${d.country_code || 'unknown'} ${d.asn || ''} ${d.as_name || ''}`.trim() })
    }
  ];
  const tasks = apis.map(api => {
    const controller = new AbortController();
    return {
      cancel: () => controller.abort(),
      promise: (async () => {
        const url = `${api.url}${api.url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
        const response = await fetchWithTimeout(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { ip, loc } = api.parse(await response.json());
        return { edgeIp: ip || 'unknown', loc };
      })()
    };
  });
  try {
    const { edgeIp, loc } = await Promise.any(tasks.map(t => t.promise));
    tasks.forEach(t => t.cancel && t.cancel());
    setNetworkFieldValue('overseas-ip', edgeIp, 'ip');
    setNetworkFieldValue('overseas-country', loc || 'unknown', 'location');
    setStatus('status-overseas', 'success');
    return;
  } catch (error) {
    tasks.forEach(t => t.cancel && t.cancel());
  }
  setNetworkFieldError('overseas-ip', 'load failed');
  clearNetworkFieldValue('overseas-country');
  setStatus('status-overseas', 'error');
}

function isValidIpv4(ip) {
  const value = String(ip || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  return value.split('.').every(part => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function isValidIpv6(ip) {
  const value = String(ip || '').trim().replace(/^\[|\]$/g, '');
  if (!value || !value.includes(':')) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch (e) {
    return false;
  }
}

function detectIpVersion(ip) {
  const value = String(ip || '').trim();
  if (!value) return '';
  if (isValidIpv4(value)) return 'v4';
  if (isValidIpv6(value)) return 'v6';
  return '';
}

function formatCloudFlareLocation(data) {
  const country = String(data?.country || '').trim();
  const org = String(data?.org || '').trim();
  return `${country} ${org}`.trim() || 'unknown';
}

async function fetchCloudFlareData() {
  setStatus('status-cf', 'loading');
  cloudFlareEntries = [];
  cloudFlareActiveIndex = 0;
  const timestamp = Date.now();
  const endpoints = [
    { url: 'https://ipv4.090227.xyz' },
    { url: 'https://ipv6.090227.xyz' }
  ];
  try {
    const results = await Promise.allSettled(endpoints.map(async endpoint => {
      const response = await fetchWithTimeout(`${endpoint.url}/?_t=${timestamp}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ip = String(data?.ip || '').trim();
      const version = detectIpVersion(ip);
      if (!ip || !version) throw new Error('invalid ip payload');
      return { ip, version, loc: formatCloudFlareLocation(data) };
    }));
    const seen = new Set();
    results.forEach(result => {
      if (result.status !== 'fulfilled') return;
      const entry = result.value;
      if (!entry?.ip || !entry?.version) return;
      const key = `${entry.version}:${entry.ip}`;
      if (seen.has(key)) return;
      seen.add(key);
      cloudFlareEntries.push(entry);
    });
    if (!cloudFlareEntries.length) throw new Error('no entries');
    renderCloudFlareActiveEntry();
    setStatus('status-cf', 'success');
  } catch (error) {
    setNetworkFieldError('cf-ip', 'load failed');
    clearNetworkFieldValue('cf-country');
    setStatus('status-cf', 'error');
  }
}

function renderCloudFlareSubtitle() {
  const subtitleElement = $('cf-subtitle');
  if (!subtitleElement) return;
  if (!cloudFlareEntries.length) {
    subtitleElement.textContent = 'ProxyIP';
    return;
  }
  if (cloudFlareEntries.length === 1) {
    const entry = cloudFlareEntries[0];
    subtitleElement.innerHTML = `<span class="${getCloudFlareProxyClass(entry.version)}">${getCloudFlareProxyLabel(entry.version, true)}</span>`;
    return;
  }
  cloudFlareActiveIndex = Math.min(Math.max(cloudFlareActiveIndex, 0), cloudFlareEntries.length - 1);
  const subtitleHtml = cloudFlareEntries.map((entry, index) => {
    const isActive = index === cloudFlareActiveIndex;
    const label = getCloudFlareProxyLabel(entry.version, isActive);
    const cls = getCloudFlareProxyClass(entry.version);
    if (isActive) return `<span class="${cls}">${label}</span>`;
    return `<span class="${cls} cf-subtitle-switch" data-cf-target-index="${index}" role="button" tabindex="0">${label}</span>`;
  }).join('<span class="cf-subtitle-sep"> / </span>');
  subtitleElement.innerHTML = subtitleHtml;
  subtitleElement.querySelectorAll('.cf-subtitle-switch').forEach(el => {
    el.title = 'Click to switch exit IP';
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetIndex = Number(event.currentTarget.dataset.cfTargetIndex);
      if (Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < cloudFlareEntries.length && targetIndex !== cloudFlareActiveIndex) {
        cloudFlareActiveIndex = targetIndex;
        renderCloudFlareActiveEntry();
      }
    });
  });
}

function getCloudFlareProxyClass(version) {
  if (version === 'v4') return 'cf-subtitle-v4';
  if (version === 'v6') return 'cf-subtitle-v6';
  return '';
}

function getCloudFlareProxyLabel(version, full = false) {
  if (version === 'v4') return full ? 'ProxyIPv4' : 'v4';
  if (version === 'v6') return full ? 'ProxyIPv6' : 'v6';
  return full ? 'ProxyIP' : 'IP';
}

function renderCloudFlareActiveEntry() {
  if (!cloudFlareEntries.length) return;
  cloudFlareActiveIndex = Math.min(Math.max(cloudFlareActiveIndex, 0), cloudFlareEntries.length - 1);
  const activeEntry = cloudFlareEntries[cloudFlareActiveIndex];
  setNetworkFieldValue('cf-ip', activeEntry.ip, 'ip');
  setNetworkFieldValue('cf-country', activeEntry.loc || 'unknown', 'location');
  renderCloudFlareSubtitle();
}

async function fetchTwitterData() {
  setStatus('status-twitter', 'loading');
  const statusElement = $('status-twitter');
  const titleElement = statusElement ? statusElement.parentElement : null;
  const tipElement = $('twitter-tip');
  const isInvalid = ip => {
    const candidate = String(ip || '').trim();
    return !candidate || candidate === '0.0.0.0';
  };

  const renderTwitterSubtitle = () => {
    if (!titleElement) return;
    const prevIndicator = $('status-twitter');
    const prevStatus = prevIndicator ? (prevIndicator.className.match(/status-(?!indicator)(\w+)/) || [])[1] : '';
    const getBrandClass = name => {
      if (name.includes('Google')) return 'tw-subtitle-google';
      if (name.includes('X.com')) return 'tw-subtitle-twitter';
      return '';
    };
    if (!twitterEntries.length) {
      titleElement.innerHTML = '<span class="status-indicator" id="status-twitter"></span><div class="title-text"><div class="title-main">🚀 Outside Test</div><div class="title-subtitle">Google · X.com</div></div>';
      if (prevStatus) setStatus('status-twitter', prevStatus);
      return;
    }
    if (twitterEntries.length === 1) {
      const brandClass = getBrandClass(twitterEntries[0].providerName);
      titleElement.innerHTML = `<span class="status-indicator" id="status-twitter"></span><div class="title-text"><div class="title-main">🚀 Outside Test</div><div class="title-subtitle"><span class="${brandClass}">${twitterEntries[0].providerName}</span></div></div>`;
      if (prevStatus) setStatus('status-twitter', prevStatus);
      return;
    }
    twitterActiveIndex = Math.min(Math.max(twitterActiveIndex, 0), twitterEntries.length - 1);
    const subtitleHtml = twitterEntries.map((entry, index) => {
      const isActive = index === twitterActiveIndex;
      const label = entry.providerName;
      const brandClass = getBrandClass(label);
      if (isActive) return `<span class="${brandClass}">${label}</span>`;
      return `<span class="${brandClass} cf-subtitle-switch" data-tw-target-index="${index}" role="button" tabindex="0">${label}</span>`;
    }).join('<span class="cf-subtitle-sep"> / </span>');
    titleElement.innerHTML = `<span class="status-indicator" id="status-twitter"></span><div class="title-text"><div class="title-main">🚀 Outside Test</div><div class="title-subtitle">${subtitleHtml}</div></div>`;
    if (prevStatus) setStatus('status-twitter', prevStatus);
    titleElement.querySelectorAll('.cf-subtitle-switch').forEach(el => {
      el.title = 'Click to switch source';
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetIndex = Number(event.currentTarget.dataset.twTargetIndex);
        if (Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < twitterEntries.length && targetIndex !== twitterActiveIndex) {
          twitterActiveIndex = targetIndex;
          renderTwitterActiveEntry();
        }
      });
    });
  };

  const renderTwitterActiveEntry = () => {
    if (!twitterEntries.length) return;
    twitterActiveIndex = Math.min(Math.max(twitterActiveIndex, 0), twitterEntries.length - 1);
    const activeEntry = twitterEntries[twitterActiveIndex];
    setNetworkFieldValue('twitter-ip', activeEntry.ip, 'ip');
    setNetworkFieldValue('twitter-country', activeEntry.loc || 'unknown', 'location');
    if (tipElement) tipElement.textContent = `· The IP you use to visit ${activeEntry.providerName}`;
    renderTwitterSubtitle();
  };

  const testSources = [
    {
      name: 'Google',
      createTask: () => {
        const jsonpTask = createJsonpRequest(`https://jsonp-ip.appspot.com/?_t=${Date.now()}`, 'callback');
        return {
          cancel: jsonpTask.cancel,
          promise: jsonpTask.promise.then(payload => {
            const requestIp = String(payload?.ip || '').trim();
            if (isInvalid(requestIp)) throw new Error('google jsonp invalid ip');
            return { providerName: 'Google', requestIp };
          })
        };
      }
    },
    {
      name: 'X.com',
      createTask: () => {
        const controller = new AbortController();
        return {
          cancel: () => controller.abort(),
          promise: (async () => {
            const response = await fetchWithTimeout(`https://help.x.com/cdn-cgi/trace?_t=${Date.now()}`, {
              cache: 'no-store', signal: controller.signal
            });
            if (!response.ok) throw new Error(`x trace HTTP ${response.status}`);
            const text = await response.text();
            const ipLine = text.split('\n').find(line => line.startsWith('ip='));
            const requestIp = String(ipLine ? ipLine.slice(3) : '').trim();
            if (isInvalid(requestIp)) throw new Error('x trace invalid ip');
            return { providerName: 'X.com', requestIp };
          })()
        };
      }
    }
  ];

  twitterEntries = [];
  twitterActiveIndex = 0;

  try {
    const tasks = testSources.map(source => {
      const task = source.createTask();
      return {
        cancel: task.cancel,
        promise: task.promise.then(result => ({ source: source.name, result })).catch(err => ({ source: source.name, error: err }))
      };
    });
    const results = await Promise.allSettled(tasks.map(t => t.promise));
    const successful = [];
    for (const settled of results) {
      if (settled.status === 'fulfilled' && settled.value && settled.value.result) {
        successful.push(settled.value);
      }
    }
    if (!successful.length) throw new Error('all outside entry sources failed');

    const detailPromises = successful.map(async ({ source, result }) => {
      try {
        const info = await fetchIpInfoByIp(result.requestIp);
        return {
          providerName: result.providerName,
          ip: String(info.ip || result.requestIp || 'unknown').trim(),
          loc: formatIpInfoLocation(info)
        };
      } catch (e) {
        return {
          providerName: result.providerName,
          ip: String(result.requestIp || 'unknown').trim(),
          loc: 'unknown'
        };
      }
    });
    twitterEntries = await Promise.all(detailPromises);
    twitterActiveIndex = 0;
    renderTwitterActiveEntry();
    setStatus('status-twitter', 'success');
  } catch (error) {
    setNetworkFieldError('twitter-ip', 'proxy not enabled');
    clearNetworkFieldValue('twitter-country');
    setStatus('status-twitter', 'error');
  }
}

function waitForPageComplete() {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
}

function waitForBrowserIdle(timeoutMs = NETWORK_BACKGROUND_IDLE_TIMEOUT_MS) {
  return new Promise(resolve => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
      return;
    }
    setTimeout(resolve, 0);
  });
}

function waitForDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function scheduleNetworkInfoLoad(options = {}) {
  const { delayMs = NETWORK_BACKGROUND_START_DELAY_MS } = options;
  if (networkInfoLoaded || networkInfoLoadPromise || networkInfoScheduled) return;
  networkInfoScheduled = true;
  (async () => {
    await waitForPageComplete();
    if (delayMs > 0) await waitForDelay(delayMs);
    await waitForBrowserIdle();
    await loadNetworkInfo();
  })().catch(error => {
    console.warn('Network info load scheduling failed:', error);
  }).finally(() => {
    networkInfoScheduled = false;
  });
}

async function runNetworkInfoBackgroundTask(task, index) {
  if (index > 0) await waitForDelay(NETWORK_BACKGROUND_TASK_GAP_MS);
  await waitForBrowserIdle();
  let watchdogId = null;
  const watchdog = new Promise((_, reject) => {
    watchdogId = setTimeout(() => reject(new Error(`${task.name} background timeout`)), NETWORK_BACKGROUND_TASK_TIMEOUT_MS);
  });
  try {
    await Promise.race([Promise.resolve().then(task.run), watchdog]);
  } catch (error) {
    console.warn(`[Network] ${task.name} background task error:`, error);
  } finally {
    if (watchdogId) clearTimeout(watchdogId);
  }
}

async function loadNetworkInfo() {
  if (networkInfoLoadPromise) return networkInfoLoadPromise;
  const container = $('networkCardsContainer');
  if (!container) return;
  renderNetworkCards();
  networkInfoLoaded = true;
  const tasks = [
    { name: 'Overseas Test', run: fetchOverseasTestData },
    { name: 'CloudFlare', run: fetchCloudFlareData },
    { name: 'India Test', run: fetchIndiaTestData },
    { name: 'Outside Test', run: fetchTwitterData }
  ];
  networkInfoLoadPromise = (async () => {
    for (let i = 0; i < tasks.length; i++) {
      await runNetworkInfoBackgroundTask(tasks[i], i);
    }
  })();
  return networkInfoLoadPromise;
}

/* ---------- Latency cards ---------- */
const latencySites = [
  {
    name: 'Google',
    region: 'India',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#4285F4"/><text x="12" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">G</text></svg>',
    url: 'https://www.google.co.in/favicon.ico'
  },
  {
    name: 'WhatsApp',
    region: 'India',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#25D366"/><text x="12" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">W</text></svg>',
    url: 'https://web.whatsapp.com/favicon.ico'
  },
  {
    name: 'Instagram',
    region: 'India',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#E4405F"/><text x="12" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">I</text></svg>',
    url: 'https://www.instagram.com/favicon.ico'
  },
  {
    name: 'Amazon.in',
    region: 'India',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#FF9900"/><text x="12" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#232F3E" text-anchor="middle">a</text></svg>',
    url: 'https://www.amazon.in/favicon.ico'
  },
  {
    name: 'Flipkart',
    region: 'India',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#2874F0"/><text x="12" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">F</text></svg>',
    url: 'https://www.flipkart.com/favicon.ico'
  },
  {
    name: 'Hotstar',
    region: 'India',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1A1A1A"/><text x="12" y="17" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#00A9E0" text-anchor="middle">H</text></svg>',
    url: 'https://www.hotstar.com/favicon.ico'
  },
  {
    name: 'GitHub',
    region: 'International',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#181717" d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.7 4.7 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3"></path></svg>',
    url: 'https://github.github.io/janky/images/bg_hr.png'
  },
  {
    name: 'Telegram.DC5',
    region: 'International',
    icon: '<svg width="24px" height="24px" viewBox="0 0 16 16"><path fill="#38AEEB" d="M3.17 7.84l5.24-2.17c2.49-.99 2.84-1.14 3.18-1.14.07 0 .25.03.4.15.14.12.18.19.19.26.02.07.02.28.01.39-.13 1.36-.65 4.5-.95 6.03-.13.64-.38.86-.77.88-.52.04-.91-.38-1.42-.7-.79-.5-1.05-.68-1.82-1.16-.89-.56-.52-.86.16-1.36.13-.11 2.32-2.11 2.35-2.29.03-.16-.05-.24-.14-.24-.07 0-.45-.03-1.18.71-2.33 1.51-2.65 1.5-2.96 1.5-.32-.01-.84-.17-1.3-.31-.56-.18-1.01-.27-.97-.57.02-.16.24-.32.63-.48z"></path></svg>',
    url: 'https://flora.web.telegram.org/'
  },
  {
    name: 'X.com',
    region: 'International',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1DA1F2" d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.594 1.85 2.323 3.196 4.368 3.233-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.072 1.328 4.532 2.104 7.172 2.104 8.607 0 13.3-7.132 13.3-13.3 0-.202-.005-.403-.014-.602.913-.66 1.706-1.477 2.332-2.41z"></path></svg>',
    url: 'https://abs.twimg.com/favicons/twitter.3.ico'
  },
  {
    name: 'YouTube',
    region: 'International',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#FF0000" d="M23.5 6.19a3 3 0 0 0-2.12-2.14c-1.87-.5-9.38-.5-9.38-.5s-7.5 0-9.38.5A3 3 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3 3 0 0 0 2.12 2.14c1.87.5 9.38.5 9.38.5s7.5 0 9.38-.5a3 3 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81M9.55 15.57V8.43L15.82 12z"></path></svg>',
    url: 'https://www.youtube.com/favicon.ico'
  }
];

function generateLatencyCards() {
  const container = $('latency-cards');
  if (!container) return;
  container.innerHTML = '';
  const sortedSites = [...latencySites].sort((a, b) => {
    const aIsIndia = a.region === 'India' ? 0 : 1;
    const bIsIndia = b.region === 'India' ? 0 : 1;
    return aIsIndia - bIsIndia;
  });
  sortedSites.forEach(site => {
    const siteName = site.name.toLowerCase().replace(/\s+/g, '-');
    const card = document.createElement('div');
    card.className = 'latency-card';
    card.innerHTML = `
      <div class="latency-card-header">
        <div class="latency-card-info">
          <div class="latency-card-icon-wrapper">${site.icon}</div>
          <div class="latency-card-text">
            <span class="latency-card-name">${site.name}</span>
            <span class="latency-card-region">${site.region}</span>
          </div>
        </div>
        <div class="latency-status" id="latency-${siteName}">...<span class="unit">ms</span></div>
      </div>
      <div class="latency-graph-container">
        <svg class="latency-ecg" viewBox="0 0 400 60" preserveAspectRatio="none">
          <path class="ecg-path-bg" d="M0,30 L400,30"></path>
          <path class="ecg-path" id="path-${siteName}" d="M0,30 L400,30"></path>
        </svg>
      </div>`;
    container.appendChild(card);
    latencySiteLatencies[siteName] = [];
  });
}

function getLatencyColor(latency) {
  if (latency === -1) return 'var(--destructive)';
  if (latency <= 49) return 'var(--latency-49)';
  if (latency <= 149) return 'var(--latency-149)';
  if (latency <= 299) return 'var(--latency-299)';
  if (latency <= 999) return 'var(--latency-999)';
  return 'var(--latency-999)';
}

function getLatencyCategoryClass(latency) {
  if (latency === -1) return 'latency-timeout';
  if (latency <= 49) return 'latency-fast';
  if (latency <= 149) return 'latency-good';
  if (latency <= 299) return 'latency-slow';
  return 'latency-timeout';
}

function updateLatencyCard(siteName, latency) {
  const statusEl = $('latency-' + siteName);
  if (statusEl) {
    const color = getLatencyColor(latency);
    if (latency === -1) {
      statusEl.innerHTML = `timeout`;
      statusEl.className = 'latency-status latency-timeout';
    } else {
      statusEl.innerHTML = `${latency}<span class="unit">ms</span>`;
      statusEl.className = 'latency-status ' + getLatencyCategoryClass(latency);
      statusEl.style.color = color;
    }
  }
  const hist = latencySiteLatencies[siteName] || [];
  hist.push(latency === -1 ? 999 : latency);
  if (hist.length > 40) hist.shift();
  latencySiteLatencies[siteName] = hist;
  drawLatencySparkline(siteName, hist);
}

function drawLatencySparkline(siteName, values) {
  const pathEl = $('path-' + siteName);
  if (!pathEl) return;
  const width = 400;
  const height = 60;
  if (!values.length) {
    pathEl.setAttribute('d', `M0,30 L${width},30`);
    return;
  }
  const maxLatency = 500;
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = Math.max(6, height - 8 - (Math.min(v, maxLatency) / maxLatency) * (height - 12));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  pathEl.setAttribute('d', `M${points.join(' L')}`);
}

async function testLatency(site) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), latencyFetchTimeoutMs);
  latencyFetchControllers.add(controller);
  try {
    await fetch(site.url + '?t=' + Date.now(), {
      method: 'HEAD',
      cache: 'no-cache',
      mode: 'no-cors',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    return Date.now() - start;
  } catch (error) {
    return -1;
  } finally {
    clearTimeout(timeoutId);
    latencyFetchControllers.delete(controller);
  }
}

function startLatencyTest() {
  if (latencyTestActive) return;
  latencyTestActive = true;
  latencyTestSessionId += 1;
  generateLatencyCards();
  const sessionId = latencyTestSessionId;
  const runAll = async () => {
    if (!latencyTestActive || sessionId !== latencyTestSessionId) return;
    for (const site of latencySites) {
      const siteName = site.name.toLowerCase().replace(/\s+/g, '-');
      if (latencySiteUpdateInProgress[siteName]) continue;
      latencySiteUpdateInProgress[siteName] = true;
      const latency = await testLatency(site);
      updateLatencyCard(siteName, latency);
      latencySiteUpdateInProgress[siteName] = false;
    }
  };
  runAll();
  const timer = setInterval(runAll, 5000);
  latencySiteIntervals['all'] = timer;
}

function stopLatencyTest() {
  latencyTestActive = false;
  latencyTestSessionId += 1;
  Object.values(latencySiteIntervals).forEach(timer => clearInterval(timer));
  latencySiteIntervals = {};
  latencySiteUpdateInProgress = {};
  latencyFetchControllers.forEach(controller => controller.abort());
  latencyFetchControllers.clear();
}

/* ---------- IP detail modal ---------- */
async function fetchAndShowIpDetail(ip, targetElement = null) {
  let cleanIp = String(ip || '').trim();
  if (cleanIp.includes('*') && targetElement && targetElement.dataset && targetElement.dataset.rawValue) {
    cleanIp = String(targetElement.dataset.rawValue || '').trim();
  }
  if (!cleanIp || cleanIp === 'unknown') return;
  if (targetElement) {
    if (targetElement.classList.contains('is-loading')) return;
    targetElement.classList.add('is-loading');
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(`https://api.ipapi.is/?q=${cleanIp}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Primary API failed');
    } catch (e) {
      response = await fetch(`https://api.090227.xyz/api/ipapi?ip=${cleanIp}`);
      if (!response.ok) throw new Error('Fallback API failed');
    }
    const data = await response.json();
    showIpDetailModal(data);
  } catch (error) {
    showToast('❌ Failed to query IP details', 'error');
  } finally {
    if (targetElement) targetElement.classList.remove('is-loading');
  }
}

function makeIpClickable() {
  document.querySelectorAll('.ip-text').forEach(element => {
    const rawIpText = String(element.dataset.rawValue || element.textContent || '').trim();
    if (element.dataset.displayState !== 'ready' || element.classList.contains('clickable')) return;
    element.classList.add('clickable');
    element.title = 'Click for IP details';
    element.addEventListener('click', function (event) {
      event.stopPropagation();
      fetchAndShowIpDetail(String(this.dataset.rawValue || this.textContent || '').trim(), this);
    });
  });
}

function boolToEmoji(value, trueEmoji = '✅', falseEmoji = '❌') {
  return value ? trueEmoji : falseEmoji;
}

function formatIpType(type) {
  if (!type) return 'Unknown';
  const map = { isp: 'Residential', hosting: 'Hosting', business: 'Business' };
  return map[String(type).toLowerCase()] || type;
}

function formatAbuseScorePercentage(score) {
  const percentage = score * 100;
  if (percentage < 0.25) return '0.0' + Math.round(percentage * 100) + '%';
  return percentage.toFixed(2) + '%';
}

function getAbuseScoreBadgeClass(scorePercentage) {
  if (scorePercentage >= 20) return 'badge-danger';
  if (scorePercentage >= 5) return 'badge-warning';
  if (scorePercentage >= 0.25) return 'badge-success';
  return 'badge-info';
}

function calculateAbuseScore(companyScore, asnScore, securityFlags = {}) {
  let company = parseFloat(companyScore) || 0;
  let asn = parseFloat(asnScore) || 0;
  let baseScore = ((company + asn) / 2) * 5;
  const risks = [securityFlags.is_crawler, securityFlags.is_proxy, securityFlags.is_vpn, securityFlags.is_tor, securityFlags.is_abuser];
  const riskCount = risks.filter(Boolean).length;
  let score = baseScore;
  for (let i = 0; i < riskCount; i++) score *= 1.15;
  return Math.min(score / 100, 1);
}

function showIpDetailModal(data) {
  const body = $('ipDetailBody');
  const mapEl = $('ipDetailMap');
  if (!body) return;
  const companyScore = data.company?.abuser_score;
  const asnScore = data.asn?.abuser_score;
  const securityFlags = {
    is_crawler: data.is_crawler, is_proxy: data.is_proxy, is_vpn: data.is_vpn,
    is_tor: data.is_tor, is_abuser: data.is_abuser, is_bogon: data.is_bogon
  };
  const combinedScore = calculateAbuseScore(companyScore, asnScore, securityFlags);
  let riskHTML = 'Unknown';
  let badgeClass = 'badge-info';
  let riskLevel = 'Unknown';
  if (combinedScore !== null && combinedScore !== undefined) {
    const scorePercentage = combinedScore * 100;
    badgeClass = getAbuseScoreBadgeClass(scorePercentage);
    const formatted = formatAbuseScorePercentage(combinedScore);
    if (scorePercentage >= 100) riskLevel = 'Extremely dangerous';
    else if (scorePercentage >= 20) riskLevel = 'High risk';
    else if (scorePercentage >= 5) riskLevel = 'Mild risk';
    else if (scorePercentage >= 0.25) riskLevel = 'Clean';
    else riskLevel = 'Extremely clean';
    riskHTML = `<span class="ip-detail-badge ${badgeClass}">${formatted} ${riskLevel}</span>`;
  }
  const location = `${data.location?.country_code ? '[' + data.location.country_code + ']' : ''}${data.location?.country || ''} ${[data.location?.state, data.location?.city].filter(Boolean).join('/') || 'unknown'}`;

  body.innerHTML = `
    <div class="ip-detail-grid">
      <div class="ip-detail-card">
        <div class="ip-detail-section-title">📍 Basic Info</div>
        <div class="ip-detail-item"><span class="ip-detail-label">IP Address</span><span class="ip-detail-value">${escapeHtml(data.ip || 'unknown')}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Location</span><span class="ip-detail-value">${escapeHtml(location)}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Timezone</span><span class="ip-detail-value">${escapeHtml(data.location?.timezone || 'unknown')}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">ISP / ASN type</span><span class="ip-detail-value">${escapeHtml(formatIpType(data.company?.type))} / ${escapeHtml(formatIpType(data.asn?.type))}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Risk rating</span><span class="ip-detail-value">${riskHTML}</span></div>
      </div>
      <div class="ip-detail-card">
        <div class="ip-detail-section-title">🛡️ Security</div>
        <div class="ip-detail-item"><span class="ip-detail-label">Datacenter</span><span class="ip-detail-value">${data.is_datacenter ? '🏢 Yes' : 'No'}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Proxy server</span><span class="ip-detail-value">${data.is_proxy ? '⚠️ Yes' : 'No'}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">VPN</span><span class="ip-detail-value">${data.is_vpn ? '⚠️ Yes' : 'No'}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Tor</span><span class="ip-detail-value">${data.is_tor ? '⚠️ Yes' : 'No'}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Crawler</span><span class="ip-detail-value">${data.is_crawler ? '🤖 Yes' : 'No'}</span></div>
        <div class="ip-detail-item"><span class="ip-detail-label">Mobile</span><span class="ip-detail-value">${data.is_mobile ? '📱 Yes' : 'No'}</span></div>
      </div>
    </div>
    <p class="hint">Source: ipapi.is</p>`;
  $('ipDetailModal').classList.add('show');

  if (typeof L !== 'undefined' && mapEl) {
    mapEl.innerHTML = '';
    const lat = data.location?.latitude;
    const lon = data.location?.longitude;
    const map = L.map(mapEl).setView([lat || 20, lon || 0], lat ? 5 : 1);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    if (lat && lon) {
      L.marker([lat, lon]).addTo(map).bindPopup(escapeHtml(data.ip || '')).openPopup();
    } else {
      L.marker([20, 0]).addTo(map).bindPopup('Unknown location');
    }
  } else if (mapEl) {
    mapEl.innerHTML = '<div class="empty-state">Map unavailable</div>';
  }
}

function showIpDetailForProxy(ip) {
  fetchAndShowIpDetail(ip);
}

/* ---------- Init ---------- */
initializeTheme();
initUserMode();

setInterval(updateCountdown, 1000);
updateCountdown();

document.addEventListener('DOMContentLoaded', () => {
  // 每次打开 dashboard 都要求重新登录：登录成功后 mint 的令牌只使用一次。
  // 没有令牌（重新打开任意链接）→ 清除 auth cookie 并跳转 /login。
  const AUTHD_KEY = '_surfrpt_authed';
  let hasAuthToken = false;
  try { hasAuthToken = sessionStorage.getItem(AUTHD_KEY) === '1'; } catch (_) {}
  if (hasAuthToken) {
    try { sessionStorage.removeItem(AUTHD_KEY); } catch (_) {}
    initSaveAllMode();
    loadConfig();
    loadImportLinks();
    scheduleNetworkInfoLoad();
  } else {
    window.location.href = '/logout';
  }
});
