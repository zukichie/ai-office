require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== オフィスステージ定義 =====
const OFFICE_STAGES = [
  { id:1, name:'小規模事務所',         canvasW:900,  canvasH:490, capacity:8   },
  { id:2, name:'成長期設計事務所',     canvasW:1050, canvasH:560, capacity:15  },
  { id:3, name:'中堅設計事務所',       canvasW:1200, canvasH:640, capacity:23  },
  { id:4, name:'総合建築設計グループ', canvasW:1350, canvasH:720, capacity:999 },
];

const ROOM_RANGES_BY_STAGE = {
  1: {
    president:  { x:15,  y:15,  w:195, h:195 },
    design:     { x:225, y:15,  w:355, h:220 },
    meeting:    { x:595, y:15,  w:290, h:195 },
    site:       { x:15,  y:225, w:270, h:90  },
    bim:        { x:595, y:225, w:290, h:145 },
    reception:  { x:15,  y:330, w:560, h:145 },
    accounting: { x:590, y:385, w:295, h:90  },
  },
  2: {
    president:  { x:15,  y:15,  w:195, h:215 },
    design:     { x:225, y:15,  w:415, h:240 },
    meeting:    { x:655, y:15,  w:380, h:215 },
    site:       { x:15,  y:245, w:280, h:100 },
    openoffice: { x:305, y:270, w:335, h:75  },
    bim:        { x:655, y:245, w:380, h:165 },
    reception:  { x:15,  y:360, w:625, h:185 },
    accounting: { x:650, y:420, w:385, h:125 },
  },
  3: {
    president:  { x:15,  y:15,  w:195, h:220 },
    design:     { x:225, y:15,  w:470, h:250 },
    meeting:    { x:710, y:15,  w:475, h:220 },
    site:       { x:15,  y:250, w:290, h:110 },
    openoffice: { x:320, y:280, w:375, h:80  },
    bim:        { x:710, y:250, w:475, h:190 },
    marketing:  { x:15,  y:375, w:290, h:250 },
    reception:  { x:320, y:375, w:375, h:250 },
    accounting: { x:710, y:455, w:475, h:170 },
  },
  4: {
    president:  { x:15,  y:15,  w:305, h:225 },
    design:     { x:335, y:15,  w:400, h:260 },
    meeting:    { x:750, y:15,  w:585, h:225 },
    site:       { x:15,  y:255, w:305, h:120 },
    openoffice: { x:335, y:290, w:400, h:85  },
    bim:        { x:750, y:255, w:585, h:225 },
    marketing:  { x:15,  y:390, w:305, h:315 },
    reception:  { x:335, y:390, w:400, h:315 },
    research:   { x:750, y:495, w:280, h:210 },
    accounting: { x:1045,y:495, w:290, h:210 },
  },
};

// ===== 職種プール（30種）=====
const ROLE_POOL = [
  { role:'意匠設計士',               room:'design',     fallback:'design',     color:'#7C3AED', skinColor:'#FCA5A5' },
  { role:'構造設計士',               room:'design',     fallback:'design',     color:'#059669', skinColor:'#FBBF24' },
  { role:'設備設計士',               room:'design',     fallback:'design',     color:'#DC2626', skinColor:'#FCA5A5' },
  { role:'BIM担当',                  room:'bim',        fallback:'bim',        color:'#9333EA', skinColor:'#FBBF24' },
  { role:'積算士',                   room:'reception',  fallback:'reception',  color:'#DB2777', skinColor:'#FCA5A5' },
  { role:'施工監理員',               room:'site',       fallback:'site',       color:'#92400E', skinColor:'#FBBF24' },
  { role:'営業担当',                 room:'reception',  fallback:'reception',  color:'#0891B2', skinColor:'#FCA5A5' },
  { role:'総務・経理',               room:'accounting', fallback:'accounting', color:'#65A30D', skinColor:'#FBBF24' },
  { role:'CADオペレーター',          room:'openoffice', fallback:'design',     color:'#2563EB', skinColor:'#FCA5A5' },
  { role:'インテリアデザイナー',     room:'design',     fallback:'design',     color:'#D97706', skinColor:'#FCA5A5' },
  { role:'プロジェクトマネージャー', room:'meeting',    fallback:'meeting',    color:'#1D4ED8', skinColor:'#FBBF24' },
  { role:'法規・確認申請担当',       room:'openoffice', fallback:'accounting', color:'#7C3AED', skinColor:'#FBBF24' },
  { role:'品質管理担当',             room:'site',       fallback:'site',       color:'#059669', skinColor:'#FBBF24' },
  { role:'広報・マーケティング',     room:'marketing',  fallback:'reception',  color:'#EC4899', skinColor:'#FCA5A5' },
  { role:'IT担当',                   room:'bim',        fallback:'bim',        color:'#0284C7', skinColor:'#FBBF24' },
  { role:'都市計画士',               room:'openoffice', fallback:'design',     color:'#6D28D9', skinColor:'#FBBF24' },
  { role:'ランドスケープデザイナー', room:'design',     fallback:'design',     color:'#16A34A', skinColor:'#FCA5A5' },
  { role:'環境設備コンサルタント',   room:'openoffice', fallback:'bim',        color:'#0891B2', skinColor:'#FBBF24' },
  { role:'安全管理士',               room:'site',       fallback:'site',       color:'#DC2626', skinColor:'#FBBF24' },
  { role:'3Dビジュアライザー',       room:'bim',        fallback:'bim',        color:'#7C3AED', skinColor:'#FCA5A5' },
  { role:'コスト管理士',             room:'accounting', fallback:'accounting', color:'#059669', skinColor:'#FCA5A5' },
  { role:'リノベーション専門士',     room:'design',     fallback:'design',     color:'#D97706', skinColor:'#FBBF24' },
  { role:'事業開発担当',             room:'marketing',  fallback:'reception',  color:'#DB2777', skinColor:'#FBBF24' },
  { role:'海外展開担当',             room:'marketing',  fallback:'reception',  color:'#0284C7', skinColor:'#FCA5A5' },
  { role:'サステナビリティ担当',     room:'research',   fallback:'bim',        color:'#16A34A', skinColor:'#FBBF24' },
  { role:'福祉住環境コーディネーター', room:'design',   fallback:'design',     color:'#DB2777', skinColor:'#FCA5A5' },
  { role:'技術研究員',               room:'research',   fallback:'bim',        color:'#6D28D9', skinColor:'#FBBF24' },
  { role:'不動産コンサルタント',     room:'marketing',  fallback:'reception',  color:'#B45309', skinColor:'#FCA5A5' },
  { role:'社長秘書',                 room:'president',  fallback:'reception',  color:'#9333EA', skinColor:'#FCA5A5' },
  { role:'デジタル変革推進担当',     room:'bim',        fallback:'bim',        color:'#2563EB', skinColor:'#FCA5A5' },
];

const NAME_POOL = [
  '田中 美咲','山田 拓也','吉田 健太','山本 あかね','松本 浩二',
  '井上 明日香','木村 亮','林 由美','斉藤 大輔','清水 恵',
  '山口 健','池田 さおり','橋本 賢','石川 楓','中川 義之',
  '前田 彩','岡田 誠','長谷川 美穂','藤田 龍也','近藤 幸子',
  '西村 翔','福島 玲奈','三浦 和也','坂本 千夏','村上 俊介',
  '宮本 あゆみ','土田 翼','河合 絵梨','平野 大輝','菊池 沙耶',
];

function getCurrentRooms() {
  return ROOM_RANGES_BY_STAGE[company.officeStage] || ROOM_RANGES_BY_STAGE[1];
}

// ===== 状態の保存・読み込み =====
const JSONBIN_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN  = process.env.JSONBIN_BIN_ID;
const DATA_FILE = process.env.DATA_PATH ? path.join(process.env.DATA_PATH, 'state.json') : path.join(__dirname, 'data.json');

function buildSaveData() {
  return {
    company: { ...company },
    employees: employees.map(e => ({ ...e, busy: false, dancing: false, state: 'idle' })),
    projects: projects.slice(-50),
    savedAt: Date.now(),
  };
}

function applyLoadedData(data) {
  if (!data || !data.savedAt) return;
  Object.assign(company, data.company);
  if (!company.officeStage) company.officeStage = 1;
  if (company.officeMoving === undefined) company.officeMoving = false;
  if (data.employees?.length > 0) {
    employees.length = 0;
    data.employees.forEach(e => {
      const rooms = getCurrentRooms();
      const room = rooms[e.room] ? e.room : 'reception';
      const pos = randomPosInRoom(room);
      employees.push({ ...e, room, x: pos.x, y: pos.y, targetX: pos.x, targetY: pos.y,
        busy: false, dancing: false, state: 'idle', isHome: false });
    });
  }
  if (data.projects?.length > 0) projects.push(...data.projects);
  console.log(`✅ 状態を復元: 売上¥${company.revenue.toLocaleString()} / 社員${employees.length}名 / ステージ${company.officeStage}`);
}

function saveStateRemote() {
  const body = JSON.stringify(buildSaveData());
  const req = https.request({
    hostname: 'api.jsonbin.io',
    path: `/v3/b/${JSONBIN_BIN}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY, 'Content-Length': Buffer.byteLength(body) }
  }, () => { console.log('☁️ JSONBinに保存しました'); });
  req.on('error', e => console.error('JSONBin保存エラー:', e.message));
  req.write(body); req.end();
}

function loadStateRemote() {
  return new Promise(resolve => {
    https.get({
      hostname: 'api.jsonbin.io',
      path: `/v3/b/${JSONBIN_BIN}/latest`,
      headers: { 'X-Master-Key': JSONBIN_KEY, 'X-Bin-Meta': 'false' }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { applyLoadedData(JSON.parse(raw)); } catch(e) { console.error('JSONBin読み込みエラー:', e.message); }
        resolve();
      });
    }).on('error', e => { console.error('JSONBin取得エラー:', e.message); resolve(); });
  });
}

function saveStateLocal() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(buildSaveData())); } catch(e) { console.error('ローカル保存エラー:', e.message); }
}

function loadStateLocal() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Date.now() - data.savedAt > 5 * 24 * 60 * 60 * 1000) return;
    applyLoadedData(data);
  } catch(e) { console.error('ローカル読み込みエラー:', e.message); }
}

function saveState() {
  if (JSONBIN_KEY && JSONBIN_BIN) saveStateRemote();
  else saveStateLocal();
}

async function loadState() {
  if (JSONBIN_KEY && JSONBIN_BIN) await loadStateRemote();
  else loadStateLocal();
}

setInterval(saveState, 5 * 60 * 1000); // 5分ごとに保存（JSONBin API節約）

// ===== 日本時間 =====
function getJST() { return new Date(Date.now() + 9 * 60 * 60 * 1000); }
function getJSTHour() { return getJST().getUTCHours(); }
function isWorkingHours() { const h = getJSTHour(); return h >= 9 && h < 18; }
function isOvertimeHours() { const h = getJSTHour(); return h >= 18 && h < 22; }

// ===== 会社 =====
const company = {
  name: '鈴木建築設計事務所',
  revenue: 0,
  completedProjects: 0,
  log: ['🏢 鈴木建築設計事務所が設立されました'],
  currentMonth: getJST().getUTCMonth(),
  coffeeCount: 0,
  officeStage: 1,
  officeMoving: false,
};

// ===== コーヒーお祝い状態 =====
let celebration = null;

// ===== プロジェクト =====
let projects = [];
const PROJECT_TYPES = ['木造住宅','RC造マンション','店舗改装','オフィスビル','公共施設','医療施設','工場・倉庫','リノベーション','集合住宅','商業施設'];
const CLIENT_NAMES  = ['田中','佐藤','山田','渡辺','伊藤','高橋','木村','林','斉藤','清水','石井','中野'];
const PHASES = [
  { id:'proposal',    name:'企画・提案', icon:'📋' },
  { id:'basic',       name:'基本設計',   icon:'✏️'  },
  { id:'detail',      name:'実施設計',   icon:'📐'  },
  { id:'application', name:'確認申請',   icon:'🏛️'  },
  { id:'supervision', name:'施工監理',   icon:'🏗️'  },
];

function createProject() {
  const type   = PROJECT_TYPES[Math.floor(Math.random() * PROJECT_TYPES.length)];
  const client = CLIENT_NAMES[Math.floor(Math.random() * CLIENT_NAMES.length)];
  const scale = employees.length > 10 ? 3 : employees.length > 5 ? 2 : 1;
  return {
    id: 'proj_' + Date.now(),
    name: client + '様邸 ' + type,
    client: client + '様',
    type,
    value: Math.floor(Math.random() * 1800000 * scale + 300000),
    phaseIndex: 0, progress: 0, assignees: [],
    startDate: getJST().toLocaleDateString('ja-JP'),
    notes: [], status: 'active',
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
    saveState();
  }
}

// ===== 議事録 =====
let meetingMinutes = [];

// ===== 社員 =====
function makeEmployee(id, name, role, room, color, skinColor, x, y) {
  return { id, name, role, room, state:'idle', thought:'業務中です。',
    color, skinColor, x, y, targetX:x, targetY:y,
    busy:false, overtimeHours:0,
    monthlyOvertimeLimit:Math.floor(Math.random()*80+20),
    hadPresidentMeeting:false, isHome:false, dancing:false };
}

let employees = [
  makeEmployee('president', '鈴木 誠', '代表取締役所長', 'president', '#1D4ED8','#FBBF24', 100, 100),
];

function randomPosInRoom(roomName) {
  const rooms = getCurrentRooms();
  const r = rooms[roomName] || rooms.reception;
  return { x: r.x+30+Math.random()*(r.w-60), y: r.y+25+Math.random()*(r.h-45) };
}

function addLog(msg) {
  company.log.push(msg);
  if (company.log.length > 50) company.log.shift();
  console.log(msg);
}

// ===== 自律採用・移転システム =====
let strategicMeetingInProgress = false;

async function agentStrategicMeeting() {
  if (strategicMeetingInProgress || celebration || company.officeMoving) return;
  if (!isWorkingHours() || employees.length < 1) return;

  strategicMeetingInProgress = true;

  const currentStage = OFFICE_STAGES[company.officeStage - 1];
  const nextStage = OFFICE_STAGES[company.officeStage];
  const activeProjects = projects.filter(p => p.status === 'active');
  const availableRoles = ROLE_POOL.filter(r => !employees.find(e => e.role === r.role));
  const isNearCapacity = employees.length >= currentStage.capacity - 1;

  const president = employees.find(e => e.id === 'president');
  const others = employees.filter(e => e.id !== 'president').sort(() => Math.random() - 0.5).slice(0, 2);
  const participants = [president, ...others].filter(Boolean);
  if (participants.length === 0) return;

  // 会議室に集合
  participants.forEach(emp => {
    const pos = randomPosInRoom('meeting');
    emp.targetX = pos.x; emp.targetY = pos.y;
    emp.state = 'working'; emp.thought = '経営会議中';
  });

  const monthlySalary = employees.reduce((s,e) => s + (e.salary||0), 0);
  const revenuePerPerson = Math.round(company.revenue / employees.length / 10000);
  const prompt = `あなたは「${company.name}」の代表取締役所長です。
経営判断を1つだけ行ってください。

【経営状況】
- 社員数: ${employees.length}名 / 累計売上: ¥${company.revenue.toLocaleString()}
- 社員1人あたり売上: 約${revenuePerPerson}万円
- 月次人件費: 月${Math.round(monthlySalary/10000)}万円
- 進行中案件: ${activeProjects.length}件
- 現オフィス: ${currentStage.name}（適正${currentStage.capacity}名）
- スタッフ: ${employees.map(e=>`${e.role}(月${Math.round((e.salary||0)/10000)}万)`).join('、')}
${isNearCapacity && nextStage ? `⚠️ 社員数がオフィス適正人数に近づいています。` : ''}

【採用可能職種】${availableRoles.slice(0,10).map(r=>r.role).join('、')}

【採用の目安】
- 社員1人あたり売上が200万円を超えたら採用を前向きに検討
- 現在${revenuePerPerson}万円 → ${revenuePerPerson >= 200 ? '採用を強く推奨' : '採用は時期尚早'}
- 採用した場合の月給の目安: 経験・職種に応じて25〜60万円

【回答形式】必ずこの形式で1行のみ答えてください：
採用→ HIRE|職種名|採用理由(15字以内)|月給(万円・数字のみ)
移転→ MOVE|移転理由(15字以内)
維持→ STAY|理由(15字以内)`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    });

    const decision = res.content[0].text.trim().split('\n')[0];
    console.log('🏢 経営会議決定:', decision);

    let minutesContent = `【経営戦略会議】\n参加: ${participants.map(e=>`${e.name}（${e.role}）`).join('、')}\n\n`;

    if (decision.startsWith('HIRE|')) {
      const parts = decision.split('|');
      const role      = parts[1]?.trim();
      const reason    = parts[2]?.trim();
      const salaryMan = parseInt(parts[3]) || 30;
      const salary    = salaryMan * 10000;
      minutesContent += `決定: ${role}を採用\n月給: ${salaryMan}万円\n理由: ${reason}`;
      await hireEmployee(role, null, reason, participants, salary);
    } else if (decision.startsWith('MOVE|')) {
      const reason = decision.split('|')[1]?.trim();
      minutesContent += `決定: オフィス移転\n理由: ${reason}`;
      if (nextStage) await triggerOfficeMove(reason, participants);
      else addLog('🏢 経営会議: 現在が最大規模のオフィスです。成長継続！');
    } else {
      const reason = decision.split('|')[1]?.trim() || '現状維持';
      minutesContent += `決定: 現状維持\n理由: ${reason}`;
      addLog(`🤝 経営会議: ${reason}`);
    }

    meetingMinutes.unshift({
      id: 'strategic_' + Date.now(),
      date: getJST().toLocaleDateString('ja-JP'),
      type: '経営戦略会議',
      participants: participants.map(e => `${e.name}（${e.role}）`),
      topic: '会社の成長戦略',
      content: minutesContent,
    });
    if (meetingMinutes.length > 20) meetingMinutes.pop();

  } catch(err) {
    console.error('経営会議エラー:', err.message);
  }

  setTimeout(() => {
    participants.forEach(emp => {
      const pos = randomPosInRoom(emp.room);
      emp.targetX = pos.x; emp.targetY = pos.y; emp.state = 'idle';
    });
    strategicMeetingInProgress = false;
  }, 15000);
}

async function hireEmployee(role, name, reason, deciders, salary = 300000) {
  if (!role) return;
  if (employees.find(e => e.role === role)) {
    addLog(`🤝 採用検討: ${role}は既に在籍中`);
    return;
  }

  let roleConfig = ROLE_POOL.find(r => r.role === role)
    || ROLE_POOL.find(r => !employees.find(e => e.role === r.role));
  if (!roleConfig) return;

  const rooms = getCurrentRooms();
  const room = rooms[roleConfig.room] ? roleConfig.room
    : rooms[roleConfig.fallback] ? roleConfig.fallback : 'reception';

  const usedNames = employees.map(e => e.name);
  const finalName = NAME_POOL.find(n => !usedNames.includes(n))
    || NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];

  const pos = randomPosInRoom(room);
  employees.push({
    id: role.replace(/[・\s]/g,'_') + '_' + Date.now(),
    name: finalName,
    role: roleConfig.role,
    room,
    state: 'idle',
    thought: `${roleConfig.role}として入社しました！よろしくお願いします。`,
    color: roleConfig.color,
    skinColor: roleConfig.skinColor,
    x: pos.x, y: pos.y, targetX: pos.x, targetY: pos.y,
    busy: false, overtimeHours: 0, salary,
    monthlyOvertimeLimit: Math.floor(Math.random()*80+20),
    hadPresidentMeeting: false, isHome: false, dancing: false,
  });

  addLog(`🎉 ${finalName}さん（${roleConfig.role}・月給${Math.round(salary/10000)}万円）が入社！理由: ${reason || '事業拡大'}`);
  saveState();
}

async function triggerOfficeMove(reason, deciders) {
  if (company.officeMoving) return;
  const nextStage = OFFICE_STAGES[company.officeStage];
  if (!nextStage) return;

  company.officeMoving = true;
  addLog(`🚚 AIエージェント会議決定：「${nextStage.name}」へ移転します！理由: ${reason}`);

  setTimeout(() => {
    company.officeStage++;
    company.officeMoving = false;

    const newRooms = ROOM_RANGES_BY_STAGE[company.officeStage];
    employees.forEach(emp => {
      if (!newRooms[emp.room]) {
        const rc = ROLE_POOL.find(r => r.role === emp.role);
        emp.room = (rc && newRooms[rc.room]) ? rc.room
          : (rc && newRooms[rc.fallback]) ? rc.fallback : 'reception';
      }
      const pos = randomPosInRoom(emp.room);
      emp.targetX = pos.x; emp.targetY = pos.y;
    });

    const stageName = OFFICE_STAGES[company.officeStage - 1].name;
    addLog(`✨ 「${stageName}」への移転完了！新オフィスで更なる成長を！`);
    saveState();

    meetingMinutes.unshift({
      id: 'move_' + Date.now(),
      date: getJST().toLocaleDateString('ja-JP'),
      type: '🏢 オフィス移転',
      participants: deciders.map(e => `${e.name}（${e.role}）`),
      topic: `${stageName}への移転完了`,
      content: `【移転完了】\n新オフィス: ${stageName}\n移転理由: ${reason}\n社員数: ${employees.length}名\n\n全スタッフが新オフィスに移転しました。`,
    });
    if (meetingMinutes.length > 20) meetingMinutes.pop();
  }, 20000);
}

// ===== ☕ Webhookログ =====
let webhookLog = [];

app.get('/api/webhook-log', (req, res) => res.json(webhookLog));

// ===== ☕ Buy Me a Coffee webhook =====
app.post('/api/coffee', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const headers = req.headers;
  webhookLog.unshift({ time: new Date().toISOString(), headers: { 'content-type': headers['content-type'], 'user-agent': headers['user-agent'] }, body });
  if (webhookLog.length > 20) webhookLog.pop();
  console.log('☕ BMC Webhook受信:', JSON.stringify(body, null, 2));

  const supporterName =
    body?.data?.supporter_name || body?.supporter_name ||
    body?.data?.payer_name || body?.data?.supporter_email?.split('@')[0] ||
    body?.data?.email?.split('@')[0] || '匿名さん';
  const coffees = body?.data?.coffee_count || body?.coffee_count || body?.data?.amount || 1;

  company.coffeeCount += Number(coffees);
  addLog(`☕ ${supporterName}さんがコーヒーを${coffees}杯おごってくれました！ありがとうございます！`);
  triggerCelebration(supporterName, Number(coffees)).catch(e => console.error('Celebration error:', e));
});

app.post('/api/coffee/test', async (req, res) => {
  const name = req.body?.name || 'テストさん';
  const coffees = req.body?.coffees || 1;
  res.json({ ok: true, message: `${name}のコーヒーイベント発火` });
  company.coffeeCount += coffees;
  addLog(`☕ ${name}さんがコーヒーを${coffees}杯おごってくれました！`);
  triggerCelebration(name, coffees).catch(e => console.error('Celebration error:', e));
});

async function triggerCelebration(supporterName, coffees) {
  let song;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `あなたは建築設計事務所のスタッフです。陽気でユーモアがあります。`,
      messages: [{ role: 'user', content: `${supporterName}さんがコーヒーを${coffees}杯おごってくれました！
鈴木建築設計事務所の全スタッフでお礼の歌を歌います。
建築設計事務所らしい内容を含めた楽しいお礼の歌を作ってください。
形式：
♪ タイトル: 「〇〇」 ♪

（1番）
歌詞4行

（サビ）
歌詞4行（全員で歌う部分）

（2番）
歌詞4行

踊り方の説明: 〇〇（キャラクターの動きを一文で）` }],
    });
    song = res.content[0].text;
  } catch (e) {
    song = `♪ タイトル: 「${supporterName}さんありがとうの歌」 ♪\n\n（1番）\n${supporterName}さん ありがとう\nコーヒーの香り 事務所に広がる\n図面を描く手も 軽くなるよ\n今日も頑張れる 設計の仕事\n\n（サビ）\nありがとう ありがとう\nコーヒー片手に 夢を建てよう\nありがとう ありがとう\n鈴木建築 今日も全力で！\n\n踊り方の説明: 全員でコーヒーカップを持って左右に揺れながら踊ります`;
  }

  celebration = { supporterName, coffees, song, startTime: Date.now(), duration: 30000 };

  const rooms = getCurrentRooms();
  const rec = rooms.reception;
  const centerX = rec ? rec.x + rec.w/2 : 290;
  const centerY = rec ? rec.y + rec.h/2 : 402;

  employees.forEach((emp, i) => {
    const angle = (i / employees.length) * Math.PI * 2;
    emp.targetX = centerX + Math.cos(angle) * Math.min(80, rec?.w/3 || 80);
    emp.targetY = centerY + Math.sin(angle) * Math.min(40, rec?.h/3 || 40);
    emp.dancing = true; emp.isHome = false;
    emp.thought = `☕ ${supporterName}さん、ありがとう！`;
    emp.state = 'working'; emp.busy = true;
  });

  setTimeout(() => {
    celebration = null;
    employees.forEach(emp => {
      emp.dancing = false; emp.busy = false; emp.state = 'idle';
      const pos = randomPosInRoom(emp.room);
      emp.targetX = pos.x; emp.targetY = pos.y;
    });
    addLog(`🎵 ${supporterName}さんへのお礼のダンスが終わりました。ありがとうございました！`);
  }, 30000);
}

// ===== エージェント思考 =====
async function agentThink(emp) {
  if (emp.busy || emp.isHome || emp.dancing) return;
  const working = isWorkingHours(), overtime = isOvertimeHours();
  if (!working && !overtime) {
    if (!emp.isHome) { emp.isHome = true; emp.state = 'idle'; emp.thought = '本日の業務を終えました。'; }
    return;
  }
  if (!working && overtime) {
    if (emp.overtimeHours >= emp.monthlyOvertimeLimit) {
      emp.isHome = true; emp.thought = '残業上限のため帰宅します。'; return;
    }
  }
  emp.busy = true; emp.state = 'thinking';
  const myProject = projects.find(p => p.status==='active' && p.assignees.includes(emp.id));
  const projectCtx = myProject
    ? `担当: ${myProject.name}（${PHASES[myProject.phaseIndex]?.name}、進捗${myProject.progress}%）`
    : '担当案件なし';
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: `あなたは「${company.name}」の${emp.role}「${emp.name}」です。`,
      messages: [{ role:'user', content:`売上¥${company.revenue.toLocaleString()} / ${projectCtx} / 社員${employees.length}名\n今やっていることを具体的な建築業務を含めて20文字以内で。` }],
    });
    emp.thought = res.content[0].text.trim().replace(/[「」]/g, '');
    emp.state = 'working';
    if (myProject) {
      myProject.progress = Math.min(100, myProject.progress + Math.floor(Math.random()*10+3));
      if (myProject.progress >= 100) completePhase(myProject);
    }
    const activeCount = projects.filter(p=>p.status==='active').length;
    if (Math.random()<0.25 && activeCount<employees.length*2) {
      const np = createProject();
      const freeStaff = employees.filter(e=>!projects.some(p=>p.assignees.includes(e.id)));
      if (freeStaff.length>0) { np.assignees=[freeStaff[0].id]; projects.push(np); addLog(`📋 新規受注: ${np.name} ¥${np.value.toLocaleString()}`); }
    }
    const pos = randomPosInRoom(emp.room);
    emp.targetX = pos.x; emp.targetY = pos.y;
  } catch(err) {
    emp.thought = '設計業務を進めています。'; emp.state = 'working';
  }
  setTimeout(() => { emp.busy = false; emp.state = 'idle'; }, 10000);
}

// ===== 残業・所長面談 =====
async function checkOvertimeAndMeeting() {
  for (const emp of employees) {
    if (emp.id==='president' || emp.hadPresidentMeeting) continue;
    if (emp.overtimeHours > 80) {
      emp.hadPresidentMeeting = true;
      await triggerPresidentMeeting(emp);
    }
  }
}

async function triggerPresidentMeeting(emp) {
  const president = employees.find(e=>e.id==='president');
  if (!president) return;
  addLog(`⚠️ ${emp.name}の残業が${Math.round(emp.overtimeHours)}時間に達しました。所長面談を実施します。`);
  const mp1=randomPosInRoom('meeting'), mp2=randomPosInRoom('meeting');
  emp.targetX=mp1.x; emp.targetY=mp1.y; emp.state='working'; emp.thought='所長面談中です。';
  president.targetX=mp2.x; president.targetY=mp2.y; president.state='working'; president.thought='面談を行っています。';
  try {
    const res = await anthropic.messages.create({
      model:'claude-haiku-4-5-20251001', max_tokens:400,
      system:`あなたは建築設計事務所の会議議事録アシスタントです。`,
      messages:[{ role:'user', content:`所長「鈴木 誠」と${emp.role}「${emp.name}」の残業改善面談の議事録を作成してください。
今月の残業時間: ${Math.round(emp.overtimeHours)}時間（社内目標上限80時間）
【日時】${getJST().toLocaleDateString('ja-JP')} ${getJSTHour()}:00
【参加者】鈴木 誠（代表取締役所長）、${emp.name}（${emp.role}）
【議題】長時間労働の改善について
【面談内容】（所長と社員の会話を4〜5往復、具体的な建築業務の内容を含めて）
【改善策】1. 〇〇 2. 〇〇 3. 〇〇
【次回確認日】来月初旬` }],
    });
    meetingMinutes.unshift({ id:'meet_'+Date.now(), date:getJST().toLocaleDateString('ja-JP'),
      type:'所長面談（残業改善）', participants:['鈴木 誠（所長）',`${emp.name}（${emp.role}）`],
      topic:`${emp.name}の労働時間改善面談`, content:res.content[0].text });
    if (meetingMinutes.length>20) meetingMinutes.pop();
    emp.overtimeHours = Math.floor(emp.overtimeHours*0.5);
    emp.hadPresidentMeeting = false;
    addLog(`📝 ${emp.name}との所長面談議事録を作成しました`);
  } catch(err) { console.error('面談エラー:', err.message); }
  setTimeout(() => {
    const p1=randomPosInRoom(emp.room), p2=randomPosInRoom('president');
    emp.targetX=p1.x; emp.targetY=p1.y; emp.state='idle';
    president.targetX=p2.x; president.targetY=p2.y; president.state='idle';
  }, 15000);
}

// ===== 通常会議 =====
async function triggerMeeting() {
  if (!isWorkingHours() || employees.length<2 || celebration) return;
  const activeProject = projects.find(p=>p.status==='active');
  if (!activeProject) return;
  const participants = [...employees].sort(()=>Math.random()-.5).slice(0, Math.min(3,employees.length));
  participants.forEach(emp => {
    const pos=randomPosInRoom('meeting');
    emp.targetX=pos.x; emp.targetY=pos.y; emp.state='working'; emp.thought='打ち合わせ中';
  });
  addLog(`🤝 ${participants.map(e=>e.name).join('・')}が打ち合わせを開始`);
  try {
    const res = await anthropic.messages.create({
      model:'claude-haiku-4-5-20251001', max_tokens:500,
      system:`あなたは建築設計事務所の会議議事録アシスタントです。`,
      messages:[{ role:'user', content:`設計打ち合わせの議事録を作成してください。
参加者: ${participants.map(e=>`${e.name}（${e.role}）`).join('、')}
案件: ${activeProject.name}（${PHASES[activeProject.phaseIndex]?.name}フェーズ、進捗${activeProject.progress}%）
【日時】${getJST().toLocaleDateString('ja-JP')} ${getJSTHour()}:00
【案件】${activeProject.name}
【内容】（具体的な建築設計の議論を4〜5往復）
【決定事項】1. 〇〇 2. 〇〇
【アクション】・${participants[0]?.name}: 〇〇 ・${participants[1]?.name||participants[0]?.name}: 〇〇` }],
    });
    meetingMinutes.unshift({ id:'meet_'+Date.now(), date:getJST().toLocaleDateString('ja-JP'),
      type:'設計打ち合わせ', participants:participants.map(e=>`${e.name}（${e.role}）`),
      topic:`${activeProject.name} 設計打ち合わせ`, content:res.content[0].text });
    if (meetingMinutes.length>20) meetingMinutes.pop();
    addLog(`📝 議事録作成: ${activeProject.name}`);
  } catch(err) { console.error('会議エラー:', err.message); }
  setTimeout(() => {
    participants.forEach(emp => { const pos=randomPosInRoom(emp.room); emp.targetX=pos.x; emp.targetY=pos.y; emp.state='idle'; });
  }, 15000);
}

// ===== API =====
app.get('/api/state', (req, res) => {
  const stageInfo = OFFICE_STAGES[company.officeStage - 1];
  res.json({
    company, stageInfo,
    rooms: getCurrentRooms(),
    employees,
    projects: projects.slice(-30),
    meetingMinutes: meetingMinutes.slice(0,15),
    isWorking: isWorkingHours(),
    isOvertime: isOvertimeHours(),
    jstHour: getJSTHour(),
    celebration: celebration ? {
      supporterName: celebration.supporterName,
      coffees: celebration.coffees,
      song: celebration.song,
      remainMs: Math.max(0, celebration.duration - (Date.now() - celebration.startTime)),
    } : null,
  });
});

// ===== シミュレーションループ =====
setInterval(() => {
  if (getJSTHour() >= 9) employees.forEach(e => { e.isHome = false; });
  if ((isWorkingHours() || isOvertimeHours()) && !celebration) {
    const available = employees.filter(e=>!e.busy&&!e.isHome&&!e.dancing);
    if (available.length>0) agentThink(available[Math.floor(Math.random()*available.length)]);
  }
}, 10000);

setInterval(() => { if (Math.random()<0.20) triggerMeeting(); }, 3*60*1000);

// 経営戦略会議（30分ごとに開催）
setInterval(() => {
  if (Math.random() < 0.7) agentStrategicMeeting();
}, 30 * 60 * 1000);

// 実際の残業時間を1分ごとに加算
setInterval(() => {
  if (isOvertimeHours()) {
    employees.forEach(emp => {
      if (!emp.isHome && !emp.dancing) emp.overtimeHours += 1/60;
    });
  }
}, 60 * 1000);

setInterval(() => {
  checkOvertimeAndMeeting();
  const m = getJST().getUTCMonth();
  if (m !== company.currentMonth) {
    company.currentMonth = m;
    employees.forEach(e => { e.overtimeHours=0; e.hadPresidentMeeting=false; e.monthlyOvertimeLimit=Math.floor(Math.random()*80+20); });
    addLog('📅 月次リセット: 残業時間をリセットしました');
  }
}, 60*1000);

// デプロイ前にRailwayがSIGTERMを送るので、その時点で状態を保存
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM受信: 状態を保存して終了します...');
  saveState();
  setTimeout(() => process.exit(0), 5000); // JSONBinへの送信完了を待つ
});
process.on('SIGINT', () => {
  saveState();
  setTimeout(() => process.exit(0), 3000);
});

loadState().then(() => {
  setTimeout(() => agentThink(employees[0]), 2000);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`\n🏢 ${company.name}が開きました！\n👉 http://localhost:${PORT}\n`); });
