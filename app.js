// DOM Elements
const tbody = document.querySelector('#table tbody');
const addBtn = document.getElementById('add');
const startBtn = document.getElementById('start');
const clearBtn = document.getElementById('clear');
const quantumInput = document.getElementById('quantum');
const out = document.getElementById('out');
const avgTat = document.getElementById('avg-tat');
const avgWt = document.getElementById('avg-wt');
const canvas = document.getElementById('gantt');
const ctx = canvas.getContext('2d');
const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');
const statusEl = document.getElementById('status');
const darkToggle = document.getElementById('darkToggle');
const speedSelect = document.getElementById('speedSelect');
const resetSettingsBtn = document.getElementById('resetSettings');

// Navigation
const btnDashboard = document.getElementById('btn-dashboard');
const btnHelp = document.getElementById('btn-help');
const btnSettings = document.getElementById('btn-settings');

// State
let _speedMultiplier = 1;
let _playing = false;
let _paused = false;
let _currentIndex = 0;

// Initialize
function init() {
  loadSettings();
  addDefaultRows();
  setupEventListeners();
}

function setupEventListeners() {
  addBtn.onclick = () => addRow();
  startBtn.onclick = startSimulation;
  clearBtn.onclick = () => {
    tbody.innerHTML = '';
    avgTat.textContent = '-';
    avgWt.textContent = '-';
    out.textContent = 'No results yet';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    statusEl.textContent = 'Status: cleared';
  };
  playBtn.onclick = playTimeline;
  pauseBtn.onclick = pauseTimeline;
  resetBtn.onclick = resetTimeline;

  // Navigation
  btnDashboard.onclick = () => showPage('dashboard');
  btnHelp.onclick = () => showPage('help');
  btnSettings.onclick = () => showPage('settings');

  // Settings
  darkToggle.onchange = () => {
    document.body.classList.toggle('dark', darkToggle.checked);
    localStorage.setItem('darkMode', darkToggle.checked);
  };
  speedSelect.onchange = () => {
    _speedMultiplier = parseFloat(speedSelect.value);
    localStorage.setItem('speed', _speedMultiplier);
  };
  resetSettingsBtn.onclick = () => {
    darkToggle.checked = false;
    speedSelect.value = '1';
    document.body.classList.remove('dark');
    _speedMultiplier = 1;
    localStorage.clear();
    alert('Settings reset');
  };
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
  if (pageId === 'dashboard') btnDashboard.classList.add('active');
  else if (pageId === 'help') btnHelp.classList.add('active');
  else if (pageId === 'settings') btnSettings.classList.add('active');
}

function loadSettings() {
  const isDark = localStorage.getItem('darkMode') === 'true';
  const speed = localStorage.getItem('speed') || '1';
  if (isDark) {
    darkToggle.checked = true;
    document.body.classList.add('dark');
  }
  speedSelect.value = speed;
  _speedMultiplier = parseFloat(speed);
}

function addDefaultRows() {
  addRow('P1', 0, 5);
  addRow('P2', 1, 3);
  addRow('P3', 2, 1);
}

function addRow(pid = 'P' + (tbody.children.length + 1), a = 0, b = 1) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="pid" value="${pid}" style="width:40px"></td>
    <td><input class="arr" type="number" value="${a}" min="0" style="width:50px"></td>
    <td><input class="burst" type="number" value="${b}" min="1" style="width:50px"></td>
    <td class="wait">-</td>
    <td class="tat">-</td>
    <td><button class="del" style="padding:4px 8px">X</button></td>`;
  tr.querySelector('.del').onclick = () => tr.remove();
  tbody.appendChild(tr);
}

async function startSimulation() {
  const processes = [];
  for (const tr of tbody.children) {
    const pid = tr.querySelector('.pid').value || 'P';
    const arrival = parseInt(tr.querySelector('.arr').value) || 0;
    const burst = parseInt(tr.querySelector('.burst').value) || 1;
    processes.push({ pid, arrival_time: arrival, burst_time: burst });
  }
  if (processes.length === 0) {
    alert('Add at least one process');
    return;
  }
  const quantum = parseInt(quantumInput.value) || 1;
  statusEl.textContent = 'Status: calling backend...';
  try {
    const res = await fetch('http://127.0.0.1:8000/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processes, quantum })
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    renderResults(data);
  } catch (e) {
    statusEl.textContent = `Status: Error - ${e.message}`;
    alert('Backend error: ' + e.message + '\n\nMake sure backend runs on http://127.0.0.1:8000');
    console.error(e);
  }
}

function renderResults(data) {
  drawGantt(data.timeline);
  avgTat.textContent = data.averages.avg_turnaround_time.toFixed(2);
  avgWt.textContent = data.averages.avg_waiting_time.toFixed(2);
  
  // Update table with metrics
  const metricsMap = {};
  for (const m of data.metrics) {
    metricsMap[m.pid] = m;
  }
  for (const tr of tbody.children) {
    const pid = tr.querySelector('.pid').value;
    const m = metricsMap[pid];
    if (m) {
      tr.querySelector('.wait').textContent = m.waiting_time;
      tr.querySelector('.tat').textContent = m.turnaround_time;
    }
  }
  
  out.textContent = data.metrics
    .map(m => `${m.pid}: arrival=${m.arrival_time}, burst=${m.burst_time}, comp=${m.completion_time}, wait=${m.waiting_time}, tat=${m.turnaround_time}`)
    .join('\n');
  
  window._timeline = data.timeline;
  statusEl.textContent = 'Status: ready - use Play to animate';
}

function drawGantt(timeline) {
  if (!timeline || !timeline.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const start = Math.min(...timeline.map(s => s.start));
  const end = Math.max(...timeline.map(s => s.end));
  const total = Math.max(1, end - start);
  const w = Math.max(700, total * 30);
  canvas.width = w;
  canvas.height = 120;
  ctx.clearRect(0, 0, w, canvas.height);
  ctx.font = '12px Arial';
  
  const colors = {};
  function getColor(pid) {
    if (!colors[pid]) {
      const h = Math.abs(hashCode(pid)) % 360;
      colors[pid] = `hsl(${h}, 70%, 60%)`;
    }
    return colors[pid];
  }
  
  for (const seg of timeline) {
    const x = ((seg.start - start) / total) * w;
    const w2 = ((seg.end - seg.start) / total) * w;
    ctx.fillStyle = getColor(seg.pid);
    ctx.fillRect(x, 30, w2, 50);
    ctx.fillStyle = '#000';
    ctx.fillText(`${seg.pid} (${seg.start}-${seg.end})`, x + 4, 60);
  }
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

async function playTimeline() {
  if (!window._timeline || !window._timeline.length) {
    alert('Run Start first');
    return;
  }
  if (_playing && !_paused) return;
  _playing = true;
  _paused = false;
  statusEl.textContent = 'Status: playing';
  
  for (let i = _currentIndex; i < window._timeline.length; i++) {
    if (!_playing) break;
    while (_paused) await sleep(100);
    _currentIndex = i;
    const seg = window._timeline[i];
    highlightProcess(seg.pid, 'running');
    const dur = Math.max(100, (seg.end - seg.start) * 200 / _speedMultiplier);
    await sleep(dur);
    highlightProcess(seg.pid, 'done');
  }
  
  _playing = false;
  _currentIndex = 0;
  statusEl.textContent = 'Status: finished';
}

function pauseTimeline() {
  if (!_playing) return;
  _paused = true;
  statusEl.textContent = 'Status: paused';
}

function resetTimeline() {
  _playing = false;
  _paused = false;
  _currentIndex = 0;
  for (const tr of tbody.children) {
    tr.classList.remove('row-running', 'row-done');
  }
  statusEl.textContent = 'Status: reset';
}

function highlightProcess(pid, state) {
  for (const tr of tbody.children) {
    const rowPid = tr.querySelector('.pid').value;
    if (rowPid === pid) {
      tr.classList.remove('row-done');
      if (state === 'running') tr.classList.add('row-running');
      else if (state === 'done') {
        tr.classList.remove('row-running');
        tr.classList.add('row-done');
      }
    }
  }
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Start
init();

