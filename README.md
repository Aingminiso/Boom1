# 💣 BOMB CO-OP — Prototype v0.2

โครงสร้างโปรเจกต์:

```
bomb-coop/
├── server/
│   ├── server.js          # WebSocket server + serve client static files
│   ├── gameState.js       # Room / Timer / Strike / broadcast logic
│   ├── bombGenerator.js   # สุ่ม Bomb (Wire, Button, Switch, Code module — v0.2)
│   └── package.json
└── client/
    ├── index.html
    ├── style.css
    ├── client.js
    └── assets/
        └── bgm.mp3     # เพลงประกอบฉากเกม (เล่นวนตอน game_start)
```

## รันทดสอบในเครื่อง

```bash
cd server
npm install
npm start
```

เปิด `http://localhost:3000` สองแท็บ (จำลอง Player A กับ B) — แท็บแรกกด "สร้างห้องใหม่" แท็บสองกรอกรหัสห้องเพื่อ "เข้าห้อง"

## Deploy ขึ้น Render.com (Free Tier)

1. Push โปรเจกต์นี้ขึ้น GitHub repo
2. บน [dashboard.render.com](https://dashboard.render.com) → **New → Web Service**
3. เชื่อม GitHub repo, ตั้งค่า:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Deploy เสร็จจะได้ URL เช่น `https://bomb-coop-server.onrender.com`
5. แก้ `client/client.js` บรรทัด `WS_URL` ถ้าจะแยก host client ออกจาก server ในอนาคต (ตอนนี้ server เสิร์ฟ client ให้ในตัว ไม่ต้องแก้อะไร)

> ⚠️ Free tier จะ **sleep** เมื่อไม่มีคน request เกิน ~15 นาที และตื่นช้า (cold start 30วิ–1นาที) — เพื่อนที่กด "เข้าห้อง" ครั้งแรกของวันอาจต้องรอสักครู่ก่อน connect ติด

## Message Schema (WebSocket)

### Client → Server
| type | payload | ใคร่งส่ง |
|---|---|---|
| `create_room` | `{}` | A หรือ B (คนแรก) |
| `join_room` | `{ code }` | คนที่สอง |
| `ready` | `{}` | ทั้งคู่ |
| `module_action` | `{ moduleId, action }` | เฉพาะ A — `action` แตกต่างกันตาม module type: `{type:'cut_wire', index}` (wire), `{type:'tap'}` \| `{type:'hold_release', heldSeconds, releaseDigit}` (button), `{type:'confirm_switches', positions:[...]}` (switch), `{type:'submit_code', code:'0000'}` (code) |

### Server → Client
| type | payload | หมายเหตุ |
|---|---|---|
| `room_created` / `joined_room` | `{ code, role }` | ยืนยัน role ที่ได้รับ |
| `error` | `{ message }` | เช่น ห้องเต็ม/ไม่พบห้อง |
| `ready_update` | `{ readyFlags }` | |
| `game_start` | `{ modules }` (เฉพาะ A) | B ไม่ได้รับ modules เลย |
| `timer_tick` | `{ timeRemaining }` | ทุก 1 วิ |
| `strike` | `{ strikes, maxStrikes }` | |
| `module_result` | `{ moduleId, result }` | `correct` \| `wrong` |
| `peer_disconnected` | `{ role, graceMs }` | grace period 15 วิ |
| `game_over` | `{ status, reason, timeRemaining, strikes }` | `defused` \| `exploded` |

## Design Decisions ที่ยืนยันแล้ว

- **Strike System:** พลาดได้ **1 ครั้ง** ก่อนระเบิด (ตรงตาม draft แนวคิดแรก)
- **Communication:** ไม่มีระบบเสียง/แชทในเกม ผู้เล่นคุยกันผ่านโปรแกรมนอก (Discord ฯลฯ)
- **Network:** Online ผ่าน WebSocket, deploy บน Render.com free tier แทน LAN local
- **Room Join:** ใช้รหัสห้อง 6 หลัก ผู้เล่นแชร์กันเอง
- **Client:** Vanilla JS + DOM (ไม่ใช้ Canvas) เพื่อความง่ายในการ debug ช่วง prototype
- **Sound:** synthesize เสียงเองด้วย Web Audio API (ไม่ใช้ไฟล์เสียงภายนอก) — คลิก/ตัดสาย/สลับสวิตช์/กดคีย์แพด, ถูก/ผิด, strike, นับถอยหลังช่วง 30 วิสุดท้าย (เร่งจังหวะที่ 10 วิ), defused/exploded. เสียงจะเล่นได้หลัง user gesture แรก (ข้อจำกัดของเบราว์เซอร์)
- **Background Music:** `client/assets/bgm.mp3` เล่นวนลูปตอน `game_start`, หยุดตอน `game_over` หรือ connection หลุด (ตัดมาจากไฟล์ที่ผู้ใช้ให้มา ตัดเฉพาะแทร็กเสียง ไม่รวมวิดีโอ) ปรับ volume ได้ที่ `bgm.volume` ใน `client.js`
- **Reconnect:** grace period 15 วิ ถ้าเกินเวลานี้ยังไม่กลับมา → จบรอบ กลับ lobby (ไม่ตัดสินเป็น exploded ทันที)

## สิ่งที่ยังไม่ทำ (ตาม Roadmap เดิม)

- Light / Logic module (v0.3)
- ระบบสุ่มความหลากหลายของกฎ ไม่ใช่แค่ค่า (v0.4)
- คู่มือหลายรูปแบบ/หลายเวอร์ชันระเบิด (v0.5)
- Animation, polish UI (v0.6)

## Known gaps (ยังไม่แก้)

- **Reconnect ยังไม่ครบวงจร:** server มี grace period 15 วิ แต่ client ไม่มี logic รีเข้าห้องเดิมอัตโนมัติ (ต้องเพิ่ม `rejoin` message + เก็บ roomCode/role ไว้ฝั่ง client)
- **Button module ไว้ใจ client:** `releaseDigit` คำนวณจาก client เอง ไม่ได้ตรวจกับเวลาจริงฝั่ง server
- **ไม่มีปุ่มออกจากห้อง** ก่อนเริ่มเกม (ต้อง refresh หน้าเท่านั้น)
