const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const demoRevenueMarkup = {
  actual: $('.actual-path').getAttribute('d'),
  area: $('.area-path').getAttribute('d'),
  forecast: $('.forecast-path').getAttribute('d'),
  points: $('.chart-points').innerHTML,
  yLabels: $('.y-labels').innerHTML,
  xLabels: $('.x-labels').innerHTML,
  ariaLabel: $('.revenue-chart').getAttribute('aria-label'),
  insights: $('.insight-list').innerHTML
};

const showToast = (message) => { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); };

function switchView(view) {
  const label = view[0].toUpperCase() + view.slice(1);
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#breadcrumb-current').textContent = label;
  $('#overview-view').classList.toggle('hidden', view !== 'overview');
  $$('.placeholder-view').forEach((section) => section.classList.toggle('visible', section.id === `${view}-view`));
  if (view !== 'overview') window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-view]').forEach((item) => item.addEventListener('click', (event) => { event.preventDefault(); switchView(item.dataset.view); }));
$$('[data-view-link]').forEach((item) => item.addEventListener('click', () => switchView(item.dataset.viewLink)));

const drawer = $('#copilot-drawer');
$('#open-copilot').addEventListener('click', () => drawer.classList.add('open'));
$('#close-copilot').addEventListener('click', () => drawer.classList.remove('open'));

const profileButton = $('#profile-button');
const profileMenu = $('#profile-menu');
profileButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = profileMenu.classList.toggle('open');
  profileButton.setAttribute('aria-expanded', String(isOpen));
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.profile-menu-wrap')) {
    profileMenu.classList.remove('open');
    profileButton.setAttribute('aria-expanded', 'false');
  }
});
$('#notifications-button').addEventListener('click', () => showToast('You are all caught up — no new notifications.'));
$$('[data-profile-action]').forEach((item) => item.addEventListener('click', () => {
  profileMenu.classList.remove('open');
  profileButton.setAttribute('aria-expanded', 'false');
  const action = item.dataset.profileAction;
  showToast(action === 'logout' ? 'Sign out is not connected in this demo workspace.' : `${item.textContent.trim()} is ready for the next account integration.`);
}));

const fileInput = $('#file-input');
const handleUpload = () => fileInput.click();
$('#upload-trigger').addEventListener('click', handleUpload);
$('#upload-trigger-2').addEventListener('click', handleUpload);
$('#browse-button').addEventListener('click', handleUpload);
const supportedFile = /\.(csv|xlsx?|xls)$/i;
let uploadRequest = 0;
const apiBase = ['4173', '4174'].includes(window.location.port) ? 'http://127.0.0.1:8000' : '';

function setUploadState(file, state, detail) {
  const drop = $('#drop-zone');
  if (!drop) return;
  const heading = drop.querySelector('h2');
  const description = drop.querySelector('p');
  const orb = drop.querySelector('.upload-orb');
  heading.textContent = state === 'processing' ? 'Profiling your dataset' : state === 'ready' ? 'Dataset profiled' : 'Dataset uploaded';
  description.textContent = detail || `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  orb.textContent = state === 'processing' ? '…' : '✓';
  orb.style.color = state === 'processing' ? 'var(--violet)' : 'var(--mint)';
  drop.classList.toggle('is-processing', state === 'processing');
}

function metricValue(source, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((result, part) => result && result[part], source);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function animateMetric(element, nextValue, suffix = '') {
  const target = Number(nextValue);
  if (!Number.isFinite(target)) { element.textContent = `${nextValue}${suffix}`; return; }
  const start = Number(element.dataset.currentValue || 0);
  const duration = 650;
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - started) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${(start + ((target - start) * eased)).toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick); else element.dataset.currentValue = target;
  };
  requestAnimationFrame(tick);
}

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function formatChartValue(value) {
  const amount = Math.abs(value);
  if (amount >= 1000000) return `$${(value / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`;
  if (amount >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value).toLocaleString()}`;
}

function renderRevenueChart(eda) {
  const series = Array.isArray(eda && eda.series)
    ? eda.series.map((point) => ({ label: point && point.label, value: Number(point && point.value) })).filter((point) => point.label && Number.isFinite(point.value))
    : [];
  if (!series.length) return false;

  const width = 800;
  const top = 18;
  const bottom = 246;
  const maxValue = Math.max(...series.map((point) => point.value), 0);
  const chartMax = maxValue > 0 ? maxValue * 1.1 : 1;
  const x = (index) => series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
  const y = (value) => bottom - ((Math.max(value, 0) / chartMax) * (bottom - top));
  const points = series.map((point, index) => `${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`);
  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${x(series.length - 1).toFixed(1)} ${bottom} L0 ${bottom}Z`;

  $('.actual-path').setAttribute('d', linePath);
  $('.area-path').setAttribute('d', areaPath);
  $('.forecast-path').setAttribute('d', '');
  $('.forecast-path').setAttribute('aria-hidden', 'true');
  $('.chart-points').innerHTML = series.map((point, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${index === series.length - 1 ? 5 : 3}"/>`).join('');
  $('.y-labels').innerHTML = [4, 3, 2, 1, 0].map((step) => `<span>${escapeHtml(formatChartValue((chartMax * step) / 4))}</span>`).join('');
  $('.x-labels').innerHTML = series.map((point) => `<span>${escapeHtml(point.label)}</span>`).join('');
  $('.revenue-chart').setAttribute('aria-label', `Revenue chart for ${eda.value_column || 'the selected measure'} over time`);
  return true;
}

function renderInsightCards(insights) {
  if (!Array.isArray(insights) || !insights.length) return;
  const colors = ['purple', 'orange', 'blue'];
  $('.insight-list').innerHTML = insights.map((insight, index) => `<div class="insight-item"><div class="insight-mark ${colors[index % colors.length]}">${index === 1 ? '!' : index === 2 ? '↗' : '✦'}</div><div><strong>Data insight ${index + 1}</strong><p>${escapeHtml(insight)}</p><button class="text-button insight-action" type="button">Explore insight <span>→</span></button></div></div>`).join('');
}

function restoreDemoOverview() {
  $('.actual-path').setAttribute('d', demoRevenueMarkup.actual);
  $('.area-path').setAttribute('d', demoRevenueMarkup.area);
  $('.forecast-path').setAttribute('d', demoRevenueMarkup.forecast);
  $('.forecast-path').removeAttribute('aria-hidden');
  $('.chart-points').innerHTML = demoRevenueMarkup.points;
  $('.y-labels').innerHTML = demoRevenueMarkup.yLabels;
  $('.x-labels').innerHTML = demoRevenueMarkup.xLabels;
  $('.revenue-chart').setAttribute('aria-label', demoRevenueMarkup.ariaLabel);
  $('.insight-list').innerHTML = demoRevenueMarkup.insights;
}

function renderProfileResults(profile, file) {
  const results = $('#profile-results');
  if (!results) return;
  const prep = profile.preprocessing || {};
  const numeric = prep.numeric_columns || [];
  const categorical = prep.categorical_columns || [];
  const datetime = prep.datetime_columns || [];
  const insights = profile.insights || [];
  results.innerHTML = `<article class="profile-card"><h3>${escapeHtml(profile.dataset_name || file.name)}</h3><p>Automated profile · cleaned metadata ready</p><div class="profile-stat-row"><div class="profile-stat"><strong>${Number(profile.row_count || 0).toLocaleString()}</strong><span>Rows</span></div><div class="profile-stat"><strong>${Number(profile.column_count || 0).toLocaleString()}</strong><span>Columns</span></div><div class="profile-stat"><strong>${Number(profile.quality_score || 0).toLocaleString()}%</strong><span>Quality</span></div></div><div class="profile-columns">${numeric.map((column) => `<span class="profile-column numeric">${escapeHtml(column)} · numeric</span>`).join('')}${categorical.map((column) => `<span class="profile-column">${escapeHtml(column)} · category</span>`).join('')}${datetime.map((column) => `<span class="profile-column datetime">${escapeHtml(column)} · date</span>`).join('')}</div></article><article class="profile-card"><h3>What DataMind found</h3><p>Signals generated from your first scan</p><div class="profile-insights">${insights.map((insight) => `<div class="profile-insight">${escapeHtml(insight)}</div>`).join('') || '<div class="profile-insight">Your dataset is ready for exploratory analysis.</div>'}</div></article>`;
  results.classList.add('visible');
}

function updateOverview(profile, file) {
  const data = profile.profile || profile.metrics || profile.dataset || profile;
  const rows = metricValue(data, ['rows', 'row_count', 'total_rows', 'shape.0']);
  const columns = metricValue(data, ['columns', 'column_count', 'total_columns', 'shape.1']);
  const missingRaw = metricValue(data, ['missing_values', 'missing', 'null_count', 'missing_count'])
    ?? metricValue(profile.preprocessing || {}, ['missing_values']);
  const missing = missingRaw && typeof missingRaw === 'object'
    ? Object.values(missingRaw).reduce((total, value) => total + (Number(value) || 0), 0)
    : missingRaw;
  const quality = metricValue(data, ['quality_score', 'data_quality', 'quality', 'score']);
  const metrics = { rows, columns, missing, quality };
  const labels = { rows: 'Rows', columns: 'Columns', missing: 'Missing values', quality: 'Data quality score' };
  Object.entries(metrics).forEach(([name, value]) => {
    if (value === null) return;
    $(`[data-metric-label="${name}"]`).textContent = labels[name];
    animateMetric($(`[data-metric-value="${name}"]`), value, name === 'quality' ? ' /100' : '');
    $(`[data-metric-foot="${name}"]`).textContent = file.name;
  });
  if (renderRevenueChart(profile.eda)) renderInsightCards(profile.insights);
  else restoreDemoOverview();
  renderProfileResults(profile, file);
}

async function profileFile(file) {
  if (!supportedFile.test(file.name)) {
    showToast('Please choose a CSV, XLS, or XLSX file.');
    return;
  }
  const requestId = ++uploadRequest;
  setUploadState(file, 'processing', `${file.name} · ${(file.size / 1024).toFixed(1)} KB · Analyzing…`);
  showToast(`${file.name} added — profiling dataset…`);
  const formData = new FormData();
  formData.append('file', file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${apiBase}/api/datasets/profile`, { method: 'POST', body: formData, signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || result.message || `Profiling failed (${response.status})`);
    if (requestId !== uploadRequest) return;
    updateOverview(result, file);
    setUploadState(file, 'ready', `${file.name} · ${(file.size / 1024).toFixed(1)} KB · Ready to analyze`);
    showToast(`${file.name} profiled successfully.`);
  } catch (error) {
    if (requestId !== uploadRequest) return;
    setUploadState(file, 'ready', `${file.name} · ${(file.size / 1024).toFixed(1)} KB · Available locally`);
    showToast(error.name === 'AbortError' ? 'Profiling timed out. The file is available locally.' : `Could not reach the profiling API. ${error.message || 'The file is available locally.'}`);
  } finally {
    clearTimeout(timeout);
  }
}

fileInput.addEventListener('change', () => { const file = fileInput.files[0]; if (file) profileFile(file); });

['#report-button', '#report-button-2'].forEach((id) => $(id).addEventListener('click', () => showToast('Your report is being generated — it will be ready shortly.')));
$('#new-model').addEventListener('click', () => showToast('Model builder is ready for your next prediction target.'));
$('#range-select').addEventListener('change', (event) => showToast(`Showing ${event.target.value.toLowerCase()}`));
$('.insight-list').addEventListener('click', (event) => {
  if (event.target.closest('.insight-action')) showToast('Opening a focused analysis of this insight.');
});

const chatResponses = {
  'why is revenue growing?': 'Revenue is up 18.4% over the last 90 days. Enterprise accounts are the main driver, contributing 62% of the increase, with the strongest lift coming from customers using three or more modules.',
  'show churn risks': 'I found 342 high-risk customers. The clearest signal is repeated payment failure: those customers are 3.1× more likely to churn in the next 30 days.',
  'summarize my data': 'Your workspace has 3 datasets with 69,233 total rows. Data quality is 94.7/100. I found 3 actionable insights: accelerating revenue, a churn cluster, and a high-value power-user segment.'
};
function addMessage(text, type) { const row = document.createElement('div'); row.className = `chat-message ${type}`; row.innerHTML = type === 'assistant' ? `<div class="chat-avatar">✦</div><div><p>${text}</p></div>` : `<div style="margin-left:auto;max-width:82%"><p style="background:#7357f5;color:#fff;border-radius:10px 0 10px 10px">${text}</p></div>`; $('#chat-messages').appendChild(row); $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight; }
function answer(text) { addMessage(text, 'user'); setTimeout(() => addMessage(chatResponses[text.toLowerCase()] || `I can help investigate “${text}”. Try asking about revenue growth, churn risks, or a summary of your data.`, 'assistant'), 450); }
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#chat-input'); const text = input.value.trim(); if (!text) return; input.value = ''; answer(text); });
$$('.suggestion-chips button').forEach((button) => button.addEventListener('click', () => answer(button.textContent)));

const dropZone = $('#drop-zone');
['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.style.borderColor = 'var(--violet)'; }));
['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.style.borderColor = ''; }));
dropZone.addEventListener('drop', (event) => { const file = event.dataTransfer.files[0]; if (file) profileFile(file); });
