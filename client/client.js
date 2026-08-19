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
    document.getElementById('lobby-message').textContent = 'การเชื่อมต่อขาดหาย กรุณารีเฟรชหน้า';
  };
}

document.getElementById('btn-create').onclick = () => {
  connect();
  ws.onopen = () => ws.send(JSON.stringify({ type: 'create_room' }));
};

document.getElementById('btn-join').onclick = () => {
  const code = document.getElementById('input-code').value.trim();
  if (!/^\d{6}$/.test(code)) {
    document.getElementById('lobby-message').textContent = 'กรุณากรอกรหัสห้อง 6 หลัก';
    return;
  }
  connect();
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join_room', code }));
};

document.getElementById('btn-ready').onclick = () => {
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
      document.getElementById('player-a-view').classList.toggle('active', myRole === 'A');
      document.getElementById('player-b-view').classList.toggle('active', myRole === 'B');
      if (myRole === 'A') {
        modulesState = {};
        msg.modules.forEach((m) => (modulesState[m.id] = m));
        renderModules();
      }
      break;

    case 'timer_tick':
      updateTimerDisplay(msg.timeRemaining);
      break;

    case 'strike':
      updateStrikeDots(msg.strikes);
      break;

    case 'module_result':
      if (myRole === 'A') {
        if (msg.result === 'correct') {
          modulesState[msg.moduleId].solved = true;
          renderModules();
        } else {
          flashWrong(msg.moduleId);
        }
      }
      break;

    case 'peer_disconnected':
      showToast(`อีกฝั่งหลุดการเชื่อมต่อ กำลังรอกลับมา (${Math.round(msg.graceMs / 1000)} วิ)...`);
      break;

    case 'game_over':
      showScreen('end');
      const title = document.getElementById('end-title');
      const detail = document.getElementById('end-detail');
      const icon = document.getElementById('end-icon');
      if (msg.status === 'defused') {
        icon.innerHTML = SUCCESS_SVG;
        title.textContent = 'BOMB DEFUSED!';
        title.style.color = '#06d6a0';
        detail.textContent = `เหลือเวลา ${formatTime(msg.timeRemaining)}`;
      } else {
        icon.innerHTML = EXPLOSION_SVG;
        title.textContent = 'BOOM! GAME OVER';
        title.style.color = '#ff5a5f';
        detail.textContent =
          msg.reason === 'timeout' ? 'หมดเวลา' : msg.reason === 'max_strikes' ? 'พลาดครบ 3 ครั้ง' : 'เกมจบกะทันหัน';
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
      box.innerHTML = `<h3>🔌 Wire Module ${mod.solved ? '✅' : ''}</h3><div class="wire-list"></div>`;
      const list = box.querySelector('.wire-list');
      mod.visibleState.wires.forEach((color, index) => {
        const wireEl = document.createElement('div');
        wireEl.className = `wire wire-${color}`;
        wireEl.textContent = `สาย ${index + 1} (${color})`;
        if (!mod.solved) {
          wireEl.onclick = () => sendModuleAction(mod.id, { type: 'cut_wire', index });
        } else {
          wireEl.classList.add('cut');
        }
        list.appendChild(wireEl);
      });
    }

    if (mod.type === 'button') {
      box.innerHTML = `<h3>🔘 Button Module ${mod.solved ? '✅' : ''}</h3>`;
      const btn = document.createElement('button');
      btn.className = `big-button btn-${mod.visibleState.color}`;
      btn.textContent = `${mod.visibleState.label}`;
      if (!mod.solved) {
        btn.onpointerdown = () => {
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
      box.appendChild(btn);
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
    if (b.querySelector('h3')?.textContent.toLowerCase().includes(moduleId)) {
      b.style.background = '#5c1a1a';
      setTimeout(() => (b.style.background = ''), 300);
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
