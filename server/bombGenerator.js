// bombGenerator.js
// สร้างระเบิดแบบสุ่มสำหรับ Prototype v0.1: มีแค่ Wire Module + Button Module
// Server เป็นคนสุ่มและเก็บ "คำตอบที่ถูกต้อง" ไว้ฝั่งเดียว
// - Player A (Bomb Handler) จะได้รับเฉพาะข้อมูล "ที่มองเห็นได้" (สี/ลำดับ/ข้อความ) ไม่ได้รับคำตอบ
// - Player B (Expert) จะได้รับ "คู่มือ" (manual) ซึ่งเป็นกฎทั่วไป ไม่ใช่คำตอบของระเบิดลูกนี้โดยตรง
//   B ต้องอนุมานคำตอบจากคู่มือ + สิ่งที่ A อธิบายมาปากเปล่า (นอกเกม)

const WIRE_COLORS = ['red', 'blue', 'yellow', 'black', 'white'];
const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'];
const BUTTON_LABELS = ['DETONATE', 'ABORT', 'HOLD', 'PRESS'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// --- Wire Module ---
// กฎ (จำลองสไตล์ KTANE แบบง่าย ใช้เป็น "คู่มือ" ที่ B เห็น):
// - ถ้ามีสายสีแดง 0 เส้น -> ตัดสายเส้นที่ 2
// - ถ้าสายเส้นสุดท้ายเป็นสีขาว -> ตัดสายเส้นสุดท้าย
// - ถ้ามีสายสีแดงมากกว่า 1 เส้น -> ตัดสายสีแดงเส้นสุดท้าย
// - ถ้าไม่เข้าเงื่อนไขใดเลย -> ตัดสายเส้นแรก
function generateWireModule() {
  const wireCount = randInt(3, 6);
  const wires = Array.from({ length: wireCount }, () => pick(WIRE_COLORS));

  let correctIndex;
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

  return {
    id: 'wire',
    type: 'wire',
    solved: false,
    // ข้อมูลที่ Player A เห็น (ไม่มีคำตอบ)
    visibleState: { wires },
    // คำตอบจริง เก็บฝั่ง server เท่านั้น ห้ามส่งให้ client โดยตรง
    _answer: { cutIndex: correctIndex },
  };
}

// --- Button Module ---
// กฎแบบง่าย:
// - ถ้าปุ่มสีแดง และข้อความ "DETONATE" -> ห้ามกด ต้อง "กดค้าง" แล้วปล่อยตอนวินาทีลงท้ายด้วย 5
// - ถ้าปุ่มสีน้ำเงิน -> กดทันที
// - อย่างอื่น -> กดค้าง 3 วินาทีแล้วปล่อย
function generateButtonModule() {
  const color = pick(BUTTON_COLORS);
  const label = pick(BUTTON_LABELS);

  let action;
  if (color === 'red' && label === 'DETONATE') {
    action = { type: 'hold_release_on_digit', digit: 5 };
  } else if (color === 'blue') {
    action = { type: 'tap' };
  } else {
    action = { type: 'hold_seconds', seconds: 3 };
  }

  return {
    id: 'button',
    type: 'button',
    solved: false,
    visibleState: { color, label },
    _answer: action,
  };
}

// --- Switch Module ---
// กฎ (ดูตารางในคู่มือ): ตำแหน่งที่ถูกต้องขึ้นกับ (สีสวิตช์, LED ติดหรือดับ)
//   แดง  + LED ติด -> ขึ้น (up)   | แดง  + LED ดับ -> ลง (down)
//   น้ำเงิน + LED ติด -> ลง (down) | น้ำเงิน + LED ดับ -> ขึ้น (up)
//   เหลือง + LED ติด -> ขึ้น (up)  | เหลือง + LED ดับ -> ลง (down)
// ต้องตั้งสวิตช์ทุกตัวให้ถูกพร้อมกัน แล้วกด "ยืนยัน" ทีเดียว (ไม่เช็คทีละตัว)
const SWITCH_COLORS = ['red', 'blue', 'yellow'];
const SWITCH_RULE_TABLE = {
  red: { on: 'up', off: 'down' },
  blue: { on: 'down', off: 'up' },
  yellow: { on: 'up', off: 'down' },
};

function generateSwitchModule() {
  const switchCount = randInt(3, 4);
  const switches = Array.from({ length: switchCount }, () => ({
    color: pick(SWITCH_COLORS),
    ledOn: Math.random() < 0.5,
    // ตำแหน่งเริ่มต้นสุ่ม ผู้เล่นต้องปรับเอง (อาจตรงกับคำตอบโดยบังเอิญก็ได้)
    initialPosition: Math.random() < 0.5 ? 'up' : 'down',
  }));

  const correctPositions = switches.map((s) => SWITCH_RULE_TABLE[s.color][s.ledOn ? 'on' : 'off']);

  return {
    id: 'switch',
    type: 'switch',
    solved: false,
    visibleState: {
      switches: switches.map((s) => ({ color: s.color, ledOn: s.ledOn, initialPosition: s.initialPosition })),
    },
    _answer: { positions: correctPositions },
  };
}

// --- Code Module ---
// กฎ: รหัส 4 หลัก = (seed x ตัวคูณตามสีจอ) mod 10000 เติม 0 ข้างหน้าให้ครบ 4 หลัก
// ตัวคูณ: แดง=13, น้ำเงิน=7, เหลือง=21, ขาว=3
const CODE_COLORS = ['red', 'blue', 'yellow', 'white'];
const CODE_MULTIPLIER = { red: 13, blue: 7, yellow: 21, white: 3 };

function generateCodeModule() {
  const seed = randInt(10, 99);
  const color = pick(CODE_COLORS);
  const code = String((seed * CODE_MULTIPLIER[color]) % 10000).padStart(4, '0');

  return {
    id: 'code',
    type: 'code',
    solved: false,
    visibleState: { seed, color },
    _answer: { code },
  };
}

function generateBomb() {
  return {
    modules: [generateWireModule(), generateButtonModule(), generateSwitchModule(), generateCodeModule()],
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
