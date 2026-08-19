// bombGenerator.js
// สร้างระเบิดแบบสุ่ม — v0.4: เพิ่มระบบ "Edition" (ตัวบ่งชี้สูตร)
// แต่ละ module จะสุ่มว่าใช้ "สูตร/กฎ" ไหนจาก 3 สูตรที่เป็นไปได้ (ไม่ใช่แค่สุ่มค่าพารามิเตอร์เหมือน v0.1-v0.3)
// Player A จะเห็น "Edition" (A/B/C) ที่ปั๊มอยู่บนตัวโมดูล และต้องบอก B ด้วยว่าเห็น edition อะไร
// เพราะคู่มือของ B มีกฎของทั้ง 3 edition อยู่ในหน้าเดียวกัน (ไม่ได้ sync มาจาก server)
// -> เพิ่มชั้นข้อมูลที่ A ต้องสื่อสารให้ B ฟัง ตรงตามคอนเซปต์ Asymmetric Information
//
// Server เป็นคนสุ่มและเก็บ "คำตอบที่ถูกต้อง" ไว้ฝั่งเดียว
// - Player A (Bomb Handler) จะได้รับเฉพาะข้อมูล "ที่มองเห็นได้" (สี/ลำดับ/ข้อความ/edition) ไม่ได้รับคำตอบ
// - Player B (Expert) จะได้รับ "คู่มือ" (manual) ซึ่งเป็นกฎทั่วไปของทุก edition ไม่ใช่คำตอบของระเบิดลูกนี้โดยตรง
//   B ต้องอนุมานคำตอบจากคู่มือ + สิ่งที่ A อธิบายมาปากเปล่า (นอกเกม) รวมถึง edition ที่เห็น

const WIRE_COLORS = ['red', 'blue', 'yellow', 'black', 'white'];
const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'];
const BUTTON_LABELS = ['DETONATE', 'ABORT', 'HOLD', 'PRESS'];
const EDITIONS = ['A', 'B', 'C'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function pickEdition() {
  return pick(EDITIONS);
}

// --- Wire Module ---
// คู่มือ (สิ่งที่ B เห็น) มี 3 สูตร แยกตาม Edition ที่ปั๊มอยู่บนโมดูล:
//
// Edition A (สูตรเดิม, style KTANE แบบง่าย):
//   - ถ้ามีสายสีแดง 0 เส้น -> ตัดสายเส้นที่ 2
//   - ถ้าสายเส้นสุดท้ายเป็นสีขาว -> ตัดสายเส้นสุดท้าย
//   - ถ้ามีสายสีแดงมากกว่า 1 เส้น -> ตัดสายสีแดงเส้นสุดท้าย
//   - ถ้าไม่เข้าเงื่อนไขใดเลย -> ตัดสายเส้นแรก
//
// Edition B (นับจำนวนสายรวม):
//   - ถ้าจำนวนสายเป็นเลขคู่ -> ตัดสายเส้นกลาง (ปัดลง)
//   - ถ้าจำนวนสายเป็นเลขคี่ และมีสายสีน้ำเงินมากกว่าสีเหลือง -> ตัดสายสีน้ำเงินเส้นแรก
//   - ถ้าจำนวนสายเป็นเลขคี่ กรณีอื่น -> ตัดสายเส้นสุดท้าย
//
// Edition C (เทียบหัว-ท้าย):
//   - ถ้าสายเส้นแรกกับเส้นสุดท้ายสีเดียวกัน -> ตัดสายเส้นที่ 2
//   - ถ้ามีสายสีดำอยู่พอดี 1 เส้น -> ตัดสายสีดำเส้นนั้น
//   - นอกเหนือจากนี้ -> ตัดสายเส้นสุดท้าย
function generateWireModule() {
  const edition = pickEdition();
  const wireCount = randInt(3, 6);
  const wires = Array.from({ length: wireCount }, () => pick(WIRE_COLORS));

  let correctIndex;

  if (edition === 'A') {
    const redCount = wires.filter((c) => c === 'red').length;
    if (redCount === 0) {
      correctIndex = 1 % wireCount;
    } else if (wires[wireCount - 1] === 'white') {
      correctIndex = wireCount - 1;
    } else if (redCount > 1) {
      correctIndex = wires.lastIndexOf('red');
    } else {
      correctIndex = 0;
    }
  } else if (edition === 'B') {
    if (wireCount % 2 === 0) {
      correctIndex = Math.floor(wireCount / 2);
    } else {
      const blueCount = wires.filter((c) => c === 'blue').length;
      const yellowCount = wires.filter((c) => c === 'yellow').length;
      if (blueCount > yellowCount) {
        correctIndex = wires.indexOf('blue');
      } else {
        correctIndex = wireCount - 1;
      }
    }
  } else {
    // Edition C
    const blackIndexes = wires.reduce((acc, c, i) => (c === 'black' ? [...acc, i] : acc), []);
    if (wires[0] === wires[wireCount - 1]) {
      correctIndex = 1 % wireCount;
    } else if (blackIndexes.length === 1) {
      correctIndex = blackIndexes[0];
    } else {
      correctIndex = wireCount - 1;
    }
  }

  return {
    id: 'wire',
    type: 'wire',
    solved: false,
    // ข้อมูลที่ Player A เห็น (ไม่มีคำตอบ) — edition คือตัวบ่งชี้สูตรที่ A ต้องบอก B
    visibleState: { wires, edition },
    // คำตอบจริง เก็บฝั่ง server เท่านั้น ห้ามส่งให้ client โดยตรง
    _answer: { cutIndex: correctIndex },
  };
}

// --- Button Module ---
// Edition A (สูตรเดิม):
//   - ปุ่มสีแดง + ข้อความ DETONATE -> กดค้าง แล้วปล่อยตอนวินาทีลงท้ายด้วย 5
//   - ปุ่มสีน้ำเงิน -> กดทันที (tap)
//   - อื่นๆ -> กดค้างอย่างน้อย 3 วินาที
//
// Edition B:
//   - ข้อความ HOLD -> กดค้าง แล้วปล่อยตอนวินาทีลงท้ายด้วย 1
//   - สีเหลือง -> กดทันที (tap)
//   - อื่นๆ -> กดค้างอย่างน้อย 5 วินาที
//
// Edition C:
//   - สีขาว + ข้อความ ABORT -> กดทันที (tap)
//   - ข้อความ PRESS -> กดค้าง แล้วปล่อยตอนวินาทีลงท้ายด้วย 9
//   - อื่นๆ -> กดค้างอย่างน้อย 2 วินาที
function generateButtonModule() {
  const edition = pickEdition();
  const color = pick(BUTTON_COLORS);
  const label = pick(BUTTON_LABELS);

  let action;
  if (edition === 'A') {
    if (color === 'red' && label === 'DETONATE') {
      action = { type: 'hold_release_on_digit', digit: 5 };
    } else if (color === 'blue') {
      action = { type: 'tap' };
    } else {
      action = { type: 'hold_seconds', seconds: 3 };
    }
  } else if (edition === 'B') {
    if (label === 'HOLD') {
      action = { type: 'hold_release_on_digit', digit: 1 };
    } else if (color === 'yellow') {
      action = { type: 'tap' };
    } else {
      action = { type: 'hold_seconds', seconds: 5 };
    }
  } else {
    // Edition C
    if (color === 'white' && label === 'ABORT') {
      action = { type: 'tap' };
    } else if (label === 'PRESS') {
      action = { type: 'hold_release_on_digit', digit: 9 };
    } else {
      action = { type: 'hold_seconds', seconds: 2 };
    }
  }

  return {
    id: 'button',
    type: 'button',
    solved: false,
    visibleState: { color, label, edition },
    _answer: action,
  };
}

// --- Switch Module ---
// Edition A (ตารางเดิม): แดง on->up/off->down | น้ำเงิน on->down/off->up | เหลือง on->up/off->down
// Edition B (ตารางกลับด้านจาก A): แดง on->down/off->up | น้ำเงิน on->up/off->down | เหลือง on->down/off->up
// Edition C (กฎรวม ไม่สนสี): นับจำนวนสวิตช์ที่ LED ติดทั้งหมด -> เลขคู่ = ตั้ง "ขึ้น" ทุกตัว, เลขคี่ = ตั้ง "ลง" ทุกตัว
// ต้องตั้งสวิตช์ทุกตัวให้ถูกพร้อมกัน แล้วกด "ยืนยัน" ทีเดียว (ไม่เช็คทีละตัว)
const SWITCH_COLORS = ['red', 'blue', 'yellow'];
const SWITCH_RULE_TABLE_A = {
  red: { on: 'up', off: 'down' },
  blue: { on: 'down', off: 'up' },
  yellow: { on: 'up', off: 'down' },
};
const SWITCH_RULE_TABLE_B = {
  red: { on: 'down', off: 'up' },
  blue: { on: 'up', off: 'down' },
  yellow: { on: 'down', off: 'up' },
};

function generateSwitchModule() {
  const edition = pickEdition();
  const switchCount = randInt(3, 4);
  const switches = Array.from({ length: switchCount }, () => ({
    color: pick(SWITCH_COLORS),
    ledOn: Math.random() < 0.5,
    // ตำแหน่งเริ่มต้นสุ่ม ผู้เล่นต้องปรับเอง (อาจตรงกับคำตอบโดยบังเอิญก็ได้)
    initialPosition: Math.random() < 0.5 ? 'up' : 'down',
  }));

  let correctPositions;
  if (edition === 'A') {
    correctPositions = switches.map((s) => SWITCH_RULE_TABLE_A[s.color][s.ledOn ? 'on' : 'off']);
  } else if (edition === 'B') {
    correctPositions = switches.map((s) => SWITCH_RULE_TABLE_B[s.color][s.ledOn ? 'on' : 'off']);
  } else {
    // Edition C: กฎรวม ไม่สนสีแต่ละตัว
    const totalOn = switches.filter((s) => s.ledOn).length;
    const shared = totalOn % 2 === 0 ? 'up' : 'down';
    correctPositions = switches.map(() => shared);
  }

  return {
    id: 'switch',
    type: 'switch',
    solved: false,
    visibleState: {
      switches: switches.map((s) => ({ color: s.color, ledOn: s.ledOn, initialPosition: s.initialPosition })),
      edition,
    },
    _answer: { positions: correctPositions },
  };
}

// --- Code Module ---
// Edition A (สูตรเดิม): รหัส = (SEED × ตัวคูณ) mod 10000
//   ตัวคูณ: แดง=13, น้ำเงิน=7, เหลือง=21, ขาว=3
// Edition B: รหัส = ((SEED + ค่าออฟเซ็ต) × 37) mod 10000
//   ออฟเซ็ต: แดง=44, น้ำเงิน=19, เหลือง=61, ขาว=8
// Edition C: รหัส = (SEED² + ค่าออฟเซ็ต) mod 10000
//   ออฟเซ็ต: แดง=101, น้ำเงิน=202, เหลือง=303, ขาว=404
const CODE_COLORS = ['red', 'blue', 'yellow', 'white'];
const CODE_MULTIPLIER_A = { red: 13, blue: 7, yellow: 21, white: 3 };
const CODE_OFFSET_B = { red: 44, blue: 19, yellow: 61, white: 8 };
const CODE_OFFSET_C = { red: 101, blue: 202, yellow: 303, white: 404 };

function generateCodeModule() {
  const edition = pickEdition();
  const seed = randInt(10, 99);
  const color = pick(CODE_COLORS);

  let code;
  if (edition === 'A') {
    code = (seed * CODE_MULTIPLIER_A[color]) % 10000;
  } else if (edition === 'B') {
    code = ((seed + CODE_OFFSET_B[color]) * 37) % 10000;
  } else {
    code = (seed * seed + CODE_OFFSET_C[color]) % 10000;
  }
  code = String(code).padStart(4, '0');

  return {
    id: 'code',
    type: 'code',
    solved: false,
    visibleState: { seed, color, edition },
    _answer: { code },
  };
}

// --- Light Module ---
// Edition A (ตารางเดิม): แดง slow->on/fast->off | น้ำเงิน slow->off/fast->on | เหลือง slow->on/fast->on
// Edition B (ตารางกลับด้าน): แดง slow->off/fast->on | น้ำเงิน slow->on/fast->off | เหลือง slow->off/fast->off
// Edition C (กฎรวม ไม่สนสี/จังหวะ): นับจำนวนดวงที่ "ติด" ตอนเริ่ม -> เลขคู่ = ตั้งติดหมดทุกดวง, เลขคี่ = ตั้งดับหมดทุกดวง
// ต้องตั้งไฟทุกดวงให้ถูกพร้อมกัน แล้วกด "ยืนยัน" ทีเดียว (เหมือน Switch Module)
const LIGHT_COLORS = ['red', 'blue', 'yellow'];
const LIGHT_RULE_TABLE_A = {
  red: { slow: 'on', fast: 'off' },
  blue: { slow: 'off', fast: 'on' },
  yellow: { slow: 'on', fast: 'on' },
};
const LIGHT_RULE_TABLE_B = {
  red: { slow: 'off', fast: 'on' },
  blue: { slow: 'on', fast: 'off' },
  yellow: { slow: 'off', fast: 'off' },
};

function generateLightModule() {
  const edition = pickEdition();
  const lightCount = 3;
  const lights = Array.from({ length: lightCount }, () => ({
    color: pick(LIGHT_COLORS),
    blinkSpeed: Math.random() < 0.5 ? 'slow' : 'fast',
    initialState: Math.random() < 0.5 ? 'on' : 'off',
  }));

  let correctStates;
  if (edition === 'A') {
    correctStates = lights.map((l) => LIGHT_RULE_TABLE_A[l.color][l.blinkSpeed]);
  } else if (edition === 'B') {
    correctStates = lights.map((l) => LIGHT_RULE_TABLE_B[l.color][l.blinkSpeed]);
  } else {
    // Edition C: กฎรวม ไม่สนสี/จังหวะ
    const totalOn = lights.filter((l) => l.initialState === 'on').length;
    const shared = totalOn % 2 === 0 ? 'on' : 'off';
    correctStates = lights.map(() => shared);
  }

  return {
    id: 'light',
    type: 'light',
    solved: false,
    visibleState: {
      lights: lights.map((l) => ({ color: l.color, blinkSpeed: l.blinkSpeed, initialState: l.initialState })),
      edition,
    },
    _answer: { states: correctStates },
  };
}

// --- Logic Module ---
// ต้องอ้างอิงข้อมูลจากโมดูล Wire และ Button ที่อยู่ในระเบิดลูกเดียวกัน (ไม่ใช่แค่ดูตัวเอง)
// ค่า checkA/checkB คำนวณจาก visibleState ของโมดูลอื่น ซึ่ง Player A มองเห็นอยู่แล้ว จึงไม่หลุดคำตอบ
// (edition ของ wire/button module เองไม่กระทบ checkA/checkB เพราะเป็นแค่ข้อมูลที่มองเห็น ไม่ใช่คำตอบ)
//
// Edition A (AND, สูตรเดิม):
//   CHECK A = จำนวนสายไฟสีแดงในโมดูล Wire เป็นเลขคี่
//   CHECK B = สีปุ่มในโมดูล Button เป็นสีแดง หรือ สีน้ำเงิน
//   กด YES ก็ต่อเมื่อ CHECK A และ CHECK B เป็นจริงทั้งคู่ ไม่งั้นกด NO
//
// Edition B (XOR):
//   CHECK A = จำนวนสายไฟทั้งหมดในโมดูล Wire มากกว่า 4 เส้น
//   CHECK B = ข้อความปุ่มในโมดูล Button เป็น HOLD หรือ PRESS
//   กด YES ก็ต่อเมื่อ CHECK A กับ CHECK B เป็นจริง "ข้อใดข้อหนึ่งเท่านั้น" (ไม่ใช่ทั้งคู่) ไม่งั้นกด NO
//
// Edition C (NOR):
//   CHECK A = มีสายไฟสีขาวอยู่ในโมดูล Wire อย่างน้อย 1 เส้น
//   CHECK B = สีปุ่มในโมดูล Button เป็นสีเหลือง
//   กด YES ก็ต่อเมื่อ CHECK A และ CHECK B เป็นเท็จทั้งคู่ ไม่งั้นกด NO
function generateLogicModule(wireModule, buttonModule) {
  const edition = pickEdition();
  const wires = wireModule.visibleState.wires;
  const btn = buttonModule.visibleState;

  let checkA;
  let checkB;
  let answer;

  if (edition === 'A') {
    const redWireCount = wires.filter((c) => c === 'red').length;
    checkA = redWireCount % 2 === 1;
    checkB = btn.color === 'red' || btn.color === 'blue';
    answer = checkA && checkB ? 'yes' : 'no';
  } else if (edition === 'B') {
    checkA = wires.length > 4;
    checkB = btn.label === 'HOLD' || btn.label === 'PRESS';
    answer = checkA !== checkB ? 'yes' : 'no'; // XOR
  } else {
    // Edition C
    checkA = wires.includes('white');
    checkB = btn.color === 'yellow';
    answer = !checkA && !checkB ? 'yes' : 'no'; // NOR
  }

  return {
    id: 'logic',
    type: 'logic',
    solved: false,
    visibleState: { checkA, checkB, edition },
    _answer: { choice: answer },
  };
}

function generateBomb() {
  const wireModule = generateWireModule();
  const buttonModule = generateButtonModule();
  return {
    modules: [
      wireModule,
      buttonModule,
      generateSwitchModule(),
      generateCodeModule(),
      generateLightModule(),
      generateLogicModule(wireModule, buttonModule),
    ],
  };
}

// ส่งเฉพาะ field ที่ client ควรเห็น (ตัด _answer ออกเสมอ)
function sanitizeModuleForClient(mod) {
  return {
    id: mod.id,
    type: mod.type,
    solved: mod.solved,
    visibleState: mod.visibleState,
  };
}

module.exports = {
  generateBomb,
  sanitizeModuleForClient,
};
