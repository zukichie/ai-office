require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== 会社の状態 =====
const company = {
  name: '山田建築設計事務所',
  revenue: 0,
  completedProjects: 0,
  log: ['🏢 山田建築設計事務所が設立されました'],
};

// ===== 社員リスト（最初は所長1名）=====
let employees = [
  {
    id: 'president',
    name: '山田 誠',
    role: '代表取締役所長',
    room: 'president',
    state: 'idle',
    thought: 'さて、事務所を立ち上げたばかりだ。最初の仕事を取らなければ。',
    color: '#1D4ED8',
    skinColor: '#FBBF24',
    x: 100, y: 100,
    targetX: 100, targetY: 100,
    busy: false,
  }
];

// ===== 成長マイルストーン =====
const MILESTONES = [
  { revenue: 500000,   name: '佐藤 花',   role: '意匠設計士',   room: 'design',    color: '#7C3AED', skinColor: '#FCA5A5' },
  { revenue: 1500000,  name: '鈴木 健',   role: '構造設計士',   room: 'design',    color: '#059669', skinColor: '#FBBF24' },
  { revenue: 3000000,  name: '高橋 ゆい', role: '設備設計士',   room: 'design',    color: '#DC2626', skinColor: '#FCA5A5' },
  { revenue: 5000000,  name: '中村 博',   role: 'BIM担当',      room: 'bim',       color: '#9333EA', skinColor: '#FBBF24' },
  { revenue: 7000000,  name: '渡辺さくら',role: '積算士',       room: 'reception', color: '#DB2777', skinColor: '#FCA5A5' },
  { revenue: 10000000, name: '伊藤 誠一', role: '施工監理員',   room: 'site',      color: '#92400E', skinColor: '#FBBF24' },
  { revenue: 14000000, name: '小林 美咲', role: '営業担当',     room: 'reception', color: '#0891B2', skinColor: '#FCA5A5' },
  { revenue: 20000000, name: '加藤 光',   role: '総務・経理',   room: 'accounting',color: '#65A30D', skinColor: '#FBBF24' },
];

// ===== 部屋ごとの初期座標範囲（フロントと共通）=====
const ROOM_RANGES = {
  president:  { x: 20,  y: 20,  w: 190, h: 190 },
  design:     { x: 230, y: 20,  w: 350, h: 220 },
  meeting:    { x: 600, y: 20,  w: 280, h: 190 },
  reception:  { x: 20,  y: 330, w: 540, h: 150 },
  bim:        { x: 600, y: 230, w: 280, h: 150 },
  site:       { x: 20,  y: 230, w: 260, h: 90  },
  accounting: { x: 580, y: 390, w: 300, h: 90  },
};

function randomPosInRoom(roomName) {
  const r = ROOM_RANGES[roomName] || ROOM_RANGES.reception;
  return {
    x: r.x + 30 + Math.random() * (r.w - 60),
    y: r.y + 25 + Math.random() * (r.h - 45),
  };
}

// ===== Claude に考えさせる =====
async function agentThink(emp) {
  if (emp.busy) return;
  emp.busy = true;
  emp.state = 'thinking';

  try {
    const recentLog = company.log.slice(-3).join(' / ');
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: `あなたは建築設計事務所「${company.name}」の${emp.role}「${emp.name}」です。リアルな建築業務をしているキャラクターです。`,
      messages: [{
        role: 'user',
        content: `売上: ¥${company.revenue.toLocaleString()} / 完了案件: ${company.completedProjects}件 / 社員: ${employees.length}名 / 最近: ${recentLog}\n\n今やっていることを具体的な建築業務を含めて**20文字以内の1文**で答えてください。例：「田中邸の平面図を修正中」「構造計算書を確認中」`
      }],
    });

    emp.thought = res.content[0].text.trim().replace(/[「」]/g, '');
    emp.state = 'working';

    // 案件完了のシミュレーション
    if (Math.random() < 0.3) {
      const types = ['住宅設計', 'マンション', 'オフィスビル', '店舗改装', '公共施設', 'リノベ', '倉庫設計', '医療施設'];
      const t = types[Math.floor(Math.random() * types.length)];
      const val = Math.floor(Math.random() * 900000 + 200000);
      company.revenue += val;
      company.completedProjects++;
      addLog(`✅ ${emp.name}が${t}案件を完了 +¥${val.toLocaleString()}`);
      checkGrowth();
    }

    // ランダムに部屋内を移動
    const pos = randomPosInRoom(emp.room);
    emp.targetX = pos.x;
    emp.targetY = pos.y;

  } catch (err) {
    console.error('Claude APIエラー:', err.message);
    emp.thought = '設計業務を進めています。';
    emp.state = 'working';
  }

  setTimeout(() => {
    emp.busy = false;
    emp.state = 'idle';
  }, 10000);
}

function addLog(msg) {
  company.log.push(msg);
  if (company.log.length > 20) company.log.shift();
  console.log(msg);
}

function checkGrowth() {
  for (const m of MILESTONES) {
    if (company.revenue >= m.revenue && !employees.find(e => e.role === m.role)) {
      const pos = randomPosInRoom(m.room);
      employees.push({
        id: m.role + '_' + Date.now(),
        name: m.name,
        role: m.role,
        room: m.room,
        state: 'idle',
        thought: `${m.role}として入社しました！よろしくお願いします。`,
        color: m.color,
        skinColor: m.skinColor,
        x: pos.x, y: pos.y,
        targetX: pos.x, targetY: pos.y,
        busy: false,
      });
      addLog(`🎉 ${m.name}さん（${m.role}）が入社しました！`);
    }
  }
}

// ===== APIエンドポイント =====
app.get('/api/state', (req, res) => {
  res.json({ company, employees });
});

// ===== シミュレーションループ（10秒ごとにランダムな1人が考える）=====
setInterval(() => {
  const available = employees.filter(e => !e.busy);
  if (available.length > 0) {
    const emp = available[Math.floor(Math.random() * available.length)];
    agentThink(emp);
  }
}, 10000);

// 起動2秒後に所長が最初に考える
setTimeout(() => agentThink(employees[0]), 2000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('🏢 山田建築設計事務所が開きました！');
  console.log(`👉 ブラウザで http://localhost:${PORT} を開いてください`);
  console.log('');
});
