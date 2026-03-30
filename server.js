require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== 日本時間 =====
function getJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function getJSTHour() { return getJST().getUTCHours(); }
function isWorkingHours() {
  const h = getJSTHour();
  return h >= 9 && h < 18;
}
function isOvertimeHours() {
  const h = getJSTHour();
  return h >= 18 && h < 22;
}

// ===== 会社 =====
const company = {
  name: '鈴木建築設計事務所',
  revenue: 0,
  completedProjects: 0,
  log: ['🏢 鈴木建築設計事務所が設立されました'],
  currentMonth: getJST().getUTCMonth(),
};

// ===== プロジェクト =====
let projects = [];
const PROJECT_TYPES  = ['木造住宅', 'RC造マンション', '店舗改装', 'オフィスビル', '公共施設', '医療施設', '工場・倉庫', 'リノベーション'];
const CLIENT_NAMES   = ['田中', '佐藤', '山田', '渡辺', '伊藤', '高橋', '木村', '林', '斉藤', '清水'];
const PHASES = [
  { id: 'proposal',    name: '企画・提案', icon: '📋' },
  { id: 'basic',       name: '基本設計',   icon: '✏️'  },
  { id: 'detail',      name: '実施設計',   icon: '📐'  },
  { id: 'application', name: '確認申請',   icon: '🏛️'  },
  { id: 'supervision', name: '施工監理',   icon: '🏗️'  },
];

function createProject() {
  const type   = PROJECT_TYPES[Math.floor(Math.random() * PROJECT_TYPES.length)];
  const client = CLIENT_NAMES[Math.floor(Math.random() * CLIENT_NAMES.length)];
  const value  = Math.floor(Math.random() * 1800000 + 300000);
  return {
    id: 'proj_' + Date.now(),
    name: client + '様邸 ' + type,
    client: client + '様',
    type,
    value,
    phaseIndex: 0,
    progress: 0,
    assignees: [],
    startDate: getJST().toLocaleDateString('ja-JP'),
    notes: [],
    status: 'active',
  };
}

function completePhase(project) {
  const phase = PHASES[project.phaseIndex];
  project.notes.push(`${phase.name}完了 (${getJST().toLocaleDateString('ja-JP')})`);

  if (project.phaseIndex < PHASES.length - 1) {
    project.phaseIndex++;
    project.progress = 0;
    addLog(`${PHASES[project.phaseIndex].icon} ${project.name}: ${PHASES[project.phaseIndex].name}フェーズへ移行`);
  } else {
    project.status = 'complete';
    project.assignees = [];
    company.revenue += project.value;
    company.completedProjects++;
    addLog(`✅ ${project.name} 竣工完了 +¥${project.value.toLocaleString()}`);
    checkGrowth();
  }
}

// ===== 議事録 =====
let meetingMinutes = [];

// ===== 社員 =====
let employees = [
  {
    id: 'president',
    name: '鈴木 誠',
    role: '代表取締役所長',
    room: 'president',
    state: 'idle',
    thought: 'さて、事務所を立ち上げたばかりだ。最初の案件を取りに行こう。',
    color: '#1D4ED8',
    skinColor: '#FBBF24',
    x: 100, y: 100,
    targetX: 100, targetY: 100,
    busy: false,
    overtimeHours: 35,
    monthlyOvertimeLimit: 45,
    hadPresidentMeeting: false,
    isHome: false,
  }
];

const MILESTONES = [
  { revenue: 500000,   name: '佐藤 花',    role: '意匠設計士',  room: 'design',    color: '#7C3AED', skinColor: '#FCA5A5' },
  { revenue: 1500000,  name: '鈴木 健',    role: '構造設計士',  room: 'design',    color: '#059669', skinColor: '#FBBF24' },
  { revenue: 3000000,  name: '高橋 ゆい',  role: '設備設計士',  room: 'design',    color: '#DC2626', skinColor: '#FCA5A5' },
  { revenue: 5000000,  name: '中村 博',    role: 'BIM担当',     room: 'bim',       color: '#9333EA', skinColor: '#FBBF24' },
  { revenue: 7000000,  name: '渡辺さくら', role: '積算士',      room: 'reception', color: '#DB2777', skinColor: '#FCA5A5' },
  { revenue: 10000000, name: '伊藤 誠一',  role: '施工監理員',  room: 'site',      color: '#92400E', skinColor: '#FBBF24' },
  { revenue: 14000000, name: '小林 美咲',  role: '営業担当',    room: 'reception', color: '#0891B2', skinColor: '#FCA5A5' },
  { revenue: 20000000, name: '加藤 光',    role: '総務・経理',  room: 'accounting',color: '#65A30D', skinColor: '#FBBF24' },
];

const ROOM_RANGES = {
  president:  { x: 15,  y: 15,  w: 195, h: 195 },
  design:     { x: 225, y: 15,  w: 355, h: 220 },
  meeting:    { x: 595, y: 15,  w: 290, h: 195 },
  site:       { x: 15,  y: 225, w: 270, h: 90  },
  bim:        { x: 595, y: 225, w: 290, h: 145 },
  reception:  { x: 15,  y: 330, w: 560, h: 145 },
  accounting: { x: 580, y: 390, w: 300, h: 90  },
};

function randomPosInRoom(roomName) {
  const r = ROOM_RANGES[roomName] || ROOM_RANGES.reception;
  return {
    x: r.x + 30 + Math.random() * (r.w - 60),
    y: r.y + 25 + Math.random() * (r.h - 45),
  };
}

function addLog(msg) {
  company.log.push(msg);
  if (company.log.length > 40) company.log.shift();
  console.log(msg);
}

// ===== エージェント思考 =====
async function agentThink(emp) {
  if (emp.busy || emp.isHome) return;

  const working = isWorkingHours();
  const overtime = isOvertimeHours();

  if (!working && !overtime) {
    // 就業時間外 → 帰宅
    if (!emp.isHome) {
      emp.isHome = true;
      emp.state = 'idle';
      emp.thought = '本日の業務を終えました。';
    }
    return;
  }

  // 残業チェック
  if (!working && overtime) {
    if (emp.overtimeHours >= emp.monthlyOvertimeLimit) {
      emp.isHome = true;
      emp.thought = '残業上限のため帰宅します。';
      return;
    }
    emp.overtimeHours += 0.5;
  }

  emp.busy = true;
  emp.state = 'thinking';

  // 担当案件
  const myProject = projects.find(p => p.status === 'active' && p.assignees.includes(emp.id));
  const projectCtx = myProject
    ? `担当: ${myProject.name}（${PHASES[myProject.phaseIndex]?.name}、進捗${myProject.progress}%）`
    : '担当案件なし';

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: `あなたは「${company.name}」の${emp.role}「${emp.name}」です。`,
      messages: [{
        role: 'user',
        content: `売上¥${company.revenue.toLocaleString()} / ${projectCtx} / 社員${employees.length}名\n今やっていることを具体的な建築業務を含めて20文字以内で。`,
      }],
    });

    emp.thought = res.content[0].text.trim().replace(/[「」]/g, '');
    emp.state = 'working';

    // 残業時間を少しずつ積み上げ（シミュレーション）
    if (working) emp.overtimeHours += Math.random() * 1.5;

    // 担当案件を進捗させる
    if (myProject) {
      myProject.progress = Math.min(100, myProject.progress + Math.floor(Math.random() * 10 + 3));
      if (myProject.progress >= 100) completePhase(myProject);
    }

    // 新規案件獲得（25%の確率）
    const activeCount = projects.filter(p => p.status === 'active').length;
    if (Math.random() < 0.25 && activeCount < employees.length * 2) {
      const np = createProject();
      const freeStaff = employees.filter(e => !projects.some(p => p.assignees.includes(e.id)));
      if (freeStaff.length > 0) {
        np.assignees = [freeStaff[0].id];
        projects.push(np);
        addLog(`📋 新規受注: ${np.name} ¥${np.value.toLocaleString()}`);
      }
    }

    const pos = randomPosInRoom(emp.room);
    emp.targetX = pos.x;
    emp.targetY = pos.y;

  } catch (err) {
    console.error('API Error:', err.message);
    emp.thought = '設計業務を進めています。';
    emp.state = 'working';
  }

  setTimeout(() => { emp.busy = false; emp.state = 'idle'; }, 10000);
}

// ===== 成長 =====
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
        overtimeHours: Math.floor(Math.random() * 40 + 20),
        monthlyOvertimeLimit: Math.floor(Math.random() * 80 + 20),
        hadPresidentMeeting: false,
        isHome: false,
      });
      addLog(`🎉 ${m.name}さん（${m.role}）が入社しました！`);
    }
  }
}

// ===== 残業チェック・所長面談 =====
async function checkOvertimeAndMeeting() {
  for (const emp of employees) {
    if (emp.id === 'president' || emp.hadPresidentMeeting) continue;
    if (emp.overtimeHours > 80) {
      emp.hadPresidentMeeting = true;
      await triggerPresidentMeeting(emp);
    }
  }
}

async function triggerPresidentMeeting(emp) {
  const president = employees.find(e => e.id === 'president');
  if (!president) return;

  addLog(`⚠️ ${emp.name}の残業が${Math.round(emp.overtimeHours)}時間に達しました。所長面談を実施します。`);

  const mp1 = randomPosInRoom('meeting');
  const mp2 = randomPosInRoom('meeting');
  emp.targetX = mp1.x; emp.targetY = mp1.y;
  president.targetX = mp2.x; president.targetY = mp2.y;
  emp.state = 'working'; emp.thought = '所長面談中です。';
  president.state = 'working'; president.thought = '面談を行っています。';

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `あなたは建築設計事務所の会議議事録アシスタントです。リアルな内容で議事録を作成してください。`,
      messages: [{
        role: 'user',
        content: `所長「鈴木 誠」と${emp.role}「${emp.name}」の残業改善面談の議事録を作成してください。
今月の残業時間: ${Math.round(emp.overtimeHours)}時間（社内目標上限80時間）

以下の形式で：
【日時】${getJST().toLocaleDateString('ja-JP')} ${getJSTHour()}:00
【参加者】鈴木 誠（代表取締役所長）、${emp.name}（${emp.role}）
【議題】長時間労働の改善について
【面談内容】（所長と社員の会話を4〜5往復、具体的な建築業務の内容を含めて）
【改善策】
1. 〇〇
2. 〇〇
3. 〇〇
【次回確認日】来月初旬`
      }],
    });

    meetingMinutes.unshift({
      id: 'meet_' + Date.now(),
      date: getJST().toLocaleDateString('ja-JP'),
      type: '所長面談（残業改善）',
      participants: ['鈴木 誠（所長）', `${emp.name}（${emp.role}）`],
      topic: `${emp.name}の労働時間改善面談`,
      content: res.content[0].text,
    });
    if (meetingMinutes.length > 20) meetingMinutes.pop();

    emp.overtimeHours = Math.floor(emp.overtimeHours * 0.5);
    emp.hadPresidentMeeting = false;
    addLog(`📝 ${emp.name}との所長面談議事録を作成しました`);

  } catch (err) {
    console.error('面談エラー:', err.message);
  }

  setTimeout(() => {
    const p1 = randomPosInRoom(emp.room);
    const p2 = randomPosInRoom('president');
    emp.targetX = p1.x; emp.targetY = p1.y; emp.state = 'idle';
    president.targetX = p2.x; president.targetY = p2.y; president.state = 'idle';
  }, 15000);
}

// ===== 通常会議 =====
async function triggerMeeting() {
  if (!isWorkingHours() || employees.length < 2) return;

  const activeProject = projects.find(p => p.status === 'active');
  if (!activeProject) return;

  const shuffled = [...employees].sort(() => Math.random() - 0.5);
  const participants = shuffled.slice(0, Math.min(3, employees.length));

  for (const emp of participants) {
    const pos = randomPosInRoom('meeting');
    emp.targetX = pos.x; emp.targetY = pos.y;
    emp.state = 'working'; emp.thought = '打ち合わせ中';
  }

  addLog(`🤝 ${participants.map(e => e.name).join('・')}が打ち合わせを開始`);

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `あなたは建築設計事務所の会議議事録アシスタントです。`,
      messages: [{
        role: 'user',
        content: `以下の設計打ち合わせの議事録を作成してください。
参加者: ${participants.map(e => `${e.name}（${e.role}）`).join('、')}
案件: ${activeProject.name}（${PHASES[activeProject.phaseIndex]?.name}フェーズ、進捗${activeProject.progress}%）
クライアント: ${activeProject.client}
以下の形式で：
【日時】${getJST().toLocaleDateString('ja-JP')} ${getJSTHour()}:00
【参加者】${participants.map(e => `${e.name}（${e.role}）`).join('、')}
【案件】${activeProject.name}
【議題】設計打ち合わせ
【内容】（具体的な建築設計の議論を4〜5往復）
【決定事項】
1. 〇〇
2. 〇〇
【アクション】
・${participants[0]?.name}: 〇〇（期限：〇〇）
・${participants[1]?.name || participants[0]?.name}: 〇〇（期限：〇〇）`
      }],
    });

    meetingMinutes.unshift({
      id: 'meet_' + Date.now(),
      date: getJST().toLocaleDateString('ja-JP'),
      type: '設計打ち合わせ',
      participants: participants.map(e => `${e.name}（${e.role}）`),
      topic: `${activeProject.name} 設計打ち合わせ`,
      content: res.content[0].text,
    });
    if (meetingMinutes.length > 20) meetingMinutes.pop();
    addLog(`📝 議事録作成: ${activeProject.name}`);

  } catch (err) {
    console.error('会議エラー:', err.message);
  }

  setTimeout(() => {
    for (const emp of participants) {
      const pos = randomPosInRoom(emp.room);
      emp.targetX = pos.x; emp.targetY = pos.y; emp.state = 'idle';
    }
  }, 15000);
}

// ===== API =====
app.get('/api/state', (req, res) => {
  res.json({
    company,
    employees,
    projects: projects.slice(-30),
    meetingMinutes: meetingMinutes.slice(0, 15),
    isWorking: isWorkingHours(),
    isOvertime: isOvertimeHours(),
    jstHour: getJSTHour(),
  });
});

// ===== シミュレーションループ =====
setInterval(() => {
  const h = getJSTHour();
  // 出社処理
  if (h >= 9) {
    employees.forEach(e => { e.isHome = false; });
  }
  // 思考
  if (isWorkingHours() || isOvertimeHours()) {
    const available = employees.filter(e => !e.busy && !e.isHome);
    if (available.length > 0) {
      agentThink(available[Math.floor(Math.random() * available.length)]);
    }
  }
}, 10000);

// 会議: 3分ごと20%の確率
setInterval(() => {
  if (Math.random() < 0.20) triggerMeeting();
}, 3 * 60 * 1000);

// 残業・面談チェック: 1分ごと
setInterval(() => {
  checkOvertimeAndMeeting();
  // 月次リセット
  const m = getJST().getUTCMonth();
  if (m !== company.currentMonth) {
    company.currentMonth = m;
    employees.forEach(e => {
      e.overtimeHours = Math.floor(Math.random() * 30 + 10);
      e.hadPresidentMeeting = false;
      e.monthlyOvertimeLimit = Math.floor(Math.random() * 80 + 20);
    });
    addLog('📅 月次リセット: 残業時間をリセットしました');
  }
}, 60 * 1000);

setTimeout(() => agentThink(employees[0]), 2000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏢 ${company.name}が開きました！\n👉 http://localhost:${PORT}\n`);
});
