// client.js
// เชื่อมต่อ WebSocket ไปยัง server, จัดการ UI ตาม role (A หรือ B)

// TODO: เปลี่ยนเป็น URL จริงของ Render.com หลัง deploy เช่น
// const WS_URL = 'wss://bomb-coop-server.onrender.com';
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

const EXPLOSION_SVG = `<svg width="140" height="140" viewBox="0 0 200 200">
  <polygon points="100,10 118,70 175,50 130,95 190,110 128,118 145,175 100,135 55,175 72,118 10,110 70,95 25,50 82,70" fill="#ff5a5f"/>
  <polygon points="100,35 112,78 152,64 122,95 165,106 120,112 132,150 100,124 68,150 80,112 35,106 78,95 48,64 88,78" fill="#ffd166"/>
  <circle cx="100" cy="100" r="26" fill="#fff4d6"/>
</svg>`;

const SUCCESS_SVG = `<svg width="140" height="140" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="80" fill="#06d6a0" opacity="0.18"/>
  <circle cx="100" cy="100" r="60" fill="#06d6a0"/>
  <path d="M70 102 L92 124 L134 78" stroke="#083" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="40" cy="50" r="6" fill="#ffd166"/>
  <circle cx="165" cy="60" r="8" fill="#4d96ff"/>
  <circle cx="35" cy="150" r="7" fill="#ff6b6b"/>
  <circle cx="170" cy="145" r="5" fill="#ffd166"/>
</svg>`;

let ws = null;
let myRole = null;
let roomCode = null;
let modulesState = {}; // moduleId -> { visibleState, solved }
let holdStart = null;
let holdModuleId = null;
let lastAlarmSecond = null;

// --- Background Music ---
const bgm = document.getElementById('bgm');
bgm.volume = 0.35;
function playBgm() {
  bgm.currentTime = 0;
  bgm.play().catch(() => {}); // เบราว์เซอร์อาจ block ถ้ายังไม่มี user gesture มาก่อนหน้านี้เลย
}
function stopBgm() {
  bgm.pause();
  bgm.currentTime = 0;
}
const SFX = (() => {
  let ctx = null;
  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.15, freqEnd = null, delay = 0 }) {
    const c = ensureCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const t0 = c.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noiseBurst({ duration = 0.25, gain = 0.2, delay = 0 }) {
    const c = ensureCtx();
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const g = c.createGain();
    const t0 = c.currentTime + delay;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    noise.connect(g).connect(c.destination);
    noise.start(t0);
  }

  return {
    click: () => tone({ freq: 700, duration: 0.05, type: 'square', gain: 0.1 }),
    keypress: () => tone({ freq: 500, duration: 0.05, type: 'square', gain: 0.08 }),
    toggle: () => tone({ freq: 300, duration: 0.07, type: 'triangle', gain: 0.12 }),
    cut: () => tone({ freq: 900, freqEnd: 200, duration: 0.15, type: 'sawtooth', gain: 0.12 }),
    correct: () => {
      tone({ freq: 523, duration: 0.1, type: 'sine', gain: 0.15 });
      tone({ freq: 784, duration: 0.15, type: 'sine', gain: 0.15, delay: 0.09 });
    },
    wrong: () => tone({ freq: 180, freqEnd: 80, duration: 0.3, type: 'sawtooth', gain: 0.18 }),
    strike: () => {
      tone({ freq: 220, duration: 0.18, type: 'square', gain: 0.16 });
      noiseBurst({ duration: 0.15, gain: 0.1 });
    },
    tick: (urgent) => tone({ freq: urgent ? 1200 : 900, duration: 0.06, type: 'square', gain: urgent ? 0.12 : 0.08 }),
    defused: () => {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'sine', gain: 0.16, delay: i * 0.1 }));
    },
    explode: () => {
      noiseBurst({ duration: 0.9, gain: 0.35 });
      tone({ freq: 150, freqEnd: 30, duration: 0.7, type: 'sawtooth', gain: 0.25 });
    },
  };
})();

const screens = {
  lobby: document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  game: document.getElementById('screen-game'),
  end: document.getElementById('screen-end'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
  ws.onclose = () => {
    stopBgm();
    document.getElementById('lobby-message').textContent = 'การเชื่อมต่อขาดหาย กรุณารีเฟรชหน้า';
  };
}

document.getElementById('btn-create').onclick = () => {
  SFX.click();
  connect();
  ws.onopen = () => ws.send(JSON.stringify({ type: 'create_room' }));
};

document.getElementById('btn-join').onclick = () => {
  SFX.click();
  const code = document.getElementById('input-code').value.trim();
  if (!/^\d{6}$/.test(code)) {
    document.getElementById('lobby-message').textContent = 'กรุณากรอกรหัสห้อง 6 หลัก';
    return;
  }
  connect();
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join_room', code }));
};

document.getElementById('btn-ready').onclick = () => {
  SFX.click();
  ws.send(JSON.stringify({ type: 'ready' }));
  document.getElementById('ready-status').textContent = 'รอผู้เล่นอีกฝั่งกด Ready...';
};

document.getElementById('btn-restart').onclick = () => {
  location.reload();
};

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'room_created':
    case 'joined_room':
      roomCode = msg.code;
      myRole = msg.role;
      document.getElementById('room-code-display').textContent = roomCode;
      document.getElementById('role-display').textContent =
        myRole === 'A' ? 'Player A (Bomb Handler)' : 'Player B (Expert)';
      document.getElementById('role-icon').textContent = myRole === 'A' ? '💣' : '📖';
      showScreen('waiting');
      break;

    case 'error':
      document.getElementById('lobby-message').textContent = msg.message;
      break;

    case 'ready_update':
      if (msg.readyFlags.A && msg.readyFlags.B) {
        document.getElementById('ready-status').textContent = 'ทั้งคู่พร้อมแล้ว กำลังเริ่ม...';
      }
      break;

    case 'game_start':
      showScreen('game');
      lastAlarmSecond = null;
      playBgm();
      document.getElementById('hud-role-label').textContent =
        myRole === 'A' ? 'BOMB HANDLER (PLAYER A)' : 'EXPERT (PLAYER B)';
      document.getElementById('player-a-view').classList.toggle('active', myRole === 'A');
      document.getElementById('player-b-view').classList.toggle('active', myRole === 'B');
      if (myRole === 'A') {
        document.getElementById('serial-number').textContent = `A${roomCode}`;
        modulesState = {};
        msg.modules.forEach((m) => (modulesState[m.id] = m));
        renderModules();
      }
      break;

    case 'timer_tick':
      updateTimerDisplay(msg.timeRemaining);
      if (msg.timeRemaining <= 30 && msg.timeRemaining > 0 && msg.timeRemaining !== lastAlarmSecond) {
        lastAlarmSecond = msg.timeRemaining;
        SFX.tick(msg.timeRemaining <= 10);
      }
      break;

    case 'strike':
      updateStrikeDots(msg.strikes);
      SFX.strike();
      break;

    case 'module_result':
      if (myRole === 'A') {
        if (msg.result === 'correct') {
          modulesState[msg.moduleId].solved = true;
          renderModules();
          SFX.correct();
        } else {
          const mod = modulesState[msg.moduleId];
          if (mod && mod.type === 'code') mod._input = '';
          renderModules();
          flashWrong(msg.moduleId);
          SFX.wrong();
        }
      }
      break;

    case 'peer_disconnected':
      showToast(`อีกฝั่งหลุดการเชื่อมต่อ กำลังรอกลับมา (${Math.round(msg.graceMs / 1000)} วิ)...`);
      break;

    case 'game_over':
      showScreen('end');
      stopBgm();
      const title = document.getElementById('end-title');
      const detail = document.getElementById('end-detail');
      const icon = document.getElementById('end-icon');
      if (msg.status === 'defused') {
        icon.innerHTML = SUCCESS_SVG;
        title.textContent = 'BOMB DEFUSED!';
        title.style.color = '#06d6a0';
        detail.textContent = `เหลือเวลา ${formatTime(msg.timeRemaining)}`;
        SFX.defused();
      } else {
        icon.innerHTML = EXPLOSION_SVG;
        title.textContent = 'BOOM! GAME OVER';
        title.style.color = '#ff5a5f';
        detail.textContent =
          msg.reason === 'timeout' ? 'หมดเวลา' : msg.reason === 'max_strikes' ? `พลาดครบ ${msg.strikes} ครั้ง` : 'เกมจบกะทันหัน';
        SFX.explode();
      }
      break;

    default:
      break;
  }
}

function updateStrikeDots(strikes) {
  const dots = document.querySelectorAll('.strike-dot');
  dots.forEach((dot, i) => dot.classList.toggle('lit', i < strikes));
}

function updateTimerDisplay(seconds) {
  document.getElementById('timer').textContent = formatTime(seconds);
}
function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderModules() {
  const container = document.getElementById('modules-container');
  container.innerHTML = '';
  Object.values(modulesState).forEach((mod) => {
    const box = document.createElement('div');
    box.className = 'module-box' + (mod.solved ? ' solved' : '');

    if (mod.type === 'wire') {
      box.innerHTML = `
        <div class="module-header"><span class="rivet"></span><h3>Wire Module</h3><span class="rivet"></span></div>
        <div class="module-body"><div class="wire-list"></div></div>`;
      const list = box.querySelector('.wire-list');
      mod.visibleState.wires.forEach((color, index) => {
        const wireEl = document.createElement('div');
        wireEl.className = `wire wire-${color}`;
        wireEl.title = `สาย ${index + 1} (${color})`;
        if (!mod.solved) {
          wireEl.onclick = () => {
            SFX.cut();
            sendModuleAction(mod.id, { type: 'cut_wire', index });
          };
        } else {
          wireEl.classList.add('cut');
        }
        list.appendChild(wireEl);
      });
    }

    if (mod.type === 'button') {
      box.innerHTML = `
        <div class="module-header"><span class="rivet"></span><h3>Button Module</h3><span class="rivet"></span></div>
        <div class="module-body"></div>`;
      const body = box.querySelector('.module-body');
      const btn = document.createElement('button');
      btn.className = `big-button btn-${mod.visibleState.color}`;
      btn.textContent = mod.visibleState.label;
      if (!mod.solved) {
        btn.onpointerdown = () => {
          SFX.click();
          holdStart = Date.now();
          holdModuleId = mod.id;
        };
        btn.onpointerup = () => {
          if (holdModuleId !== mod.id) return;
          const heldSeconds = (Date.now() - holdStart) / 1000;
          const nowDigit = parseInt(document.getElementById('timer').textContent.slice(-1), 10);
          if (heldSeconds < 0.3) {
            sendModuleAction(mod.id, { type: 'tap' });
          } else {
            sendModuleAction(mod.id, {
              type: 'hold_release',
              heldSeconds,
              releaseDigit: nowDigit,
            });
          }
          holdModuleId = null;
        };
      } else {
        btn.disabled = true;
      }
      body.appendChild(btn);
    }

    if (mod.type === 'switch') {
      box.innerHTML = `
        <div class="module-header"><span class="rivet"></span><h3>Switch Module</h3><span class="rivet"></span></div>
        <div class="module-body"><div class="switch-row"></div></div>`;
      const row = box.querySelector('.switch-row');
      // เก็บ state ตำแหน่งปัจจุบันไว้ที่ moduleState เอง (client-local จนกว่าจะกดยืนยัน)
      if (!mod._positions) {
        mod._positions = mod.visibleState.switches.map((s) => s.initialPosition);
      }
      mod.visibleState.switches.forEach((sw, index) => {
        const unit = document.createElement('div');
        unit.className = 'switch-unit';
        const led = document.createElement('span');
        led.className = `switch-led led-${sw.color}` + (sw.ledOn ? ' lit' : '');
        const lever = document.createElement('div');
        lever.className = `switch-lever switch-${sw.color} pos-${mod._positions[index]}`;
        lever.textContent = mod._positions[index] === 'up' ? '▲' : '▼';
        if (!mod.solved) {
          lever.onclick = () => {
            SFX.toggle();
            mod._positions[index] = mod._positions[index] === 'up' ? 'down' : 'up';
            renderModules();
          };
        }
        unit.appendChild(led);
        unit.appendChild(lever);
        row.appendChild(unit);
      });
      if (!mod.solved) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'switch-confirm';
        confirmBtn.textContent = 'ยืนยันตำแหน่ง';
        confirmBtn.onclick = () => {
          SFX.click();
          sendModuleAction(mod.id, { type: 'confirm_switches', positions: mod._positions });
        };
        box.querySelector('.module-body').appendChild(confirmBtn);
      }
    }

    if (mod.type === 'code') {
      box.innerHTML = `
        <div class="module-header"><span class="rivet"></span><h3>Code Module</h3><span class="rivet"></span></div>
        <div class="module-body"></div>`;
      const body = box.querySelector('.module-body');
      if (!mod._input) mod._input = '';
      const display = document.createElement('div');
      display.className = `code-screen code-screen-${mod.visibleState.color}`;
      display.innerHTML = `<span class="code-seed">SEED: ${mod.visibleState.seed}</span>
        <span class="code-input">${mod._input.padEnd(4, '_')}</span>`;
      body.appendChild(display);

      if (!mod.solved) {
        const pad = document.createElement('div');
        pad.className = 'keypad';
        '0123456789'.split('').forEach((d) => {
          const key = document.createElement('button');
          key.className = 'keypad-btn';
          key.textContent = d;
          key.onclick = () => {
            SFX.keypress();
            if (mod._input.length < 4) mod._input += d;
            renderModules();
          };
          pad.appendChild(key);
        });
        const clearKey = document.createElement('button');
        clearKey.className = 'keypad-btn keypad-clear';
        clearKey.textContent = 'CLEAR';
        clearKey.onclick = () => {
          SFX.click();
          mod._input = '';
          renderModules();
        };
        const enterKey = document.createElement('button');
        enterKey.className = 'keypad-btn keypad-enter';
        enterKey.textContent = 'ENTER';
        enterKey.onclick = () => {
          SFX.click();
          if (mod._input.length === 4) sendModuleAction(mod.id, { type: 'submit_code', code: mod._input });
        };
        pad.appendChild(clearKey);
        pad.appendChild(enterKey);
        body.appendChild(pad);
      }
    }

    container.appendChild(box);
  });
}

function sendModuleAction(moduleId, action) {
  ws.send(JSON.stringify({ type: 'module_action', moduleId, action }));
}

function flashWrong(moduleId) {
  const boxes = document.querySelectorAll('.module-box');
  boxes.forEach((b) => {
    const label = b.querySelector('h3')?.textContent.toLowerCase() || '';
    if (label.includes(moduleId)) {
      b.style.boxShadow = '0 0 0 2px #ff5a5f';
      setTimeout(() => (b.style.boxShadow = ''), 300);
    }
  });
}

function showToast(text) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText =
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;padding:10px 16px;border-radius:8px;z-index:99;';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  setTimeout(() => toast.remove(), 4000);
}
