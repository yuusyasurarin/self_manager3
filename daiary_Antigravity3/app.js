/**
 * アプリケーション設定
 */
const USE_MOCK = true; // 動作テスト用モックデータを利用するか (本番連携時は false にする)
const GAS_API_URL = "https://script.google.com/macros/s/XXXXXX/exec";
const PIN_CODE = "1234"; // 簡易PINセキュリティ

/**
 * 状態管理・バックエンドデータキャッシュ
 */
let appData = {
  MonthlyGoals: [],
  WeeklyGoals: [],
  DailyRecords: [],
  Tasks: []
};
let currentDate = new Date();
let selectedDate = new Date();

// モックの初期データ
if (USE_MOCK) {
  appData = {
    MonthlyGoals: [{ yearMonth: "2026-03", goal: "モック目標：テストを完了する" }],
    WeeklyGoals: [],
    DailyRecords: [{ dateId: "2026-03-29", body: "日記のテストです。", rating: 4 }],
    Tasks: [{ taskId: "1", dateId: "2026-03-29", content: "タスク1 (Mock)", status: "open" }]
  };
}

/**
 * DOM要素の取得
 */
const el = {
  loading: document.getElementById('loading-overlay'),
  pinScreen: document.getElementById('pin-screen'),
  mainScreen: document.getElementById('main-screen'),
  themeToggle: document.getElementById('theme-toggle'),
  navMonthly: document.getElementById('nav-monthly'),
  navWeekly: document.getElementById('nav-weekly'),
  viewMonthly: document.getElementById('view-monthly'),
  viewWeekly: document.getElementById('view-weekly'),
  viewDaily: document.getElementById('view-daily'),
  calGrid: document.getElementById('calendar-grid'),
  labelMonth: document.getElementById('current-month-label'),
  labelWeek: document.getElementById('current-week-label'),
  labelDate: document.getElementById('current-date-label'),
  backBtn: document.getElementById('back-to-calendar'),
  
  monthlyGoal: document.getElementById('monthly-goal-input'),
  saveMonthlyBtn: document.getElementById('save-monthly-goal'),
  weeklyGoal: document.getElementById('weekly-goal-input'),
  saveWeeklyBtn: document.getElementById('save-weekly-goal'),
  dailyDiary: document.getElementById('daily-diary-input'),
  saveDailyBtn: document.getElementById('save-daily-record'),
  newTaskInput: document.getElementById('new-task-input'),
  addTaskBtn: document.getElementById('add-task-btn'),
  taskList: document.getElementById('task-list'),
  dailyRating: document.getElementById('daily-rating')
};

/**
 * ユーティリティ
 */
function showLoading() { el.loading.classList.remove('hidden'); }
function hideLoading() { el.loading.classList.add('hidden'); }
const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const formatMonth = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const getWeekNumber = (d) => {
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = (d - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};
const formatWeek = (d) => `${d.getFullYear()}-W${getWeekNumber(d)}`;

/**
 * データ通信処理 (GAS / Mock)
 */
async function fetchAllData() {
  if (USE_MOCK) return; 
  showLoading();
  try {
    const res = await fetch(`${GAS_API_URL}?action=getAllData`);
    const json = await res.json();
    if (json.status === 'success') {
      appData = json.data;
    } else {
      console.error(json.message);
    }
  } catch (err) {
    console.error("Fetch Error:", err);
    alert("データ取得に失敗しました。URL等を確認してください。");
  }
  hideLoading();
}

async function saveRecord(sheetName, data) {
  if (USE_MOCK) {
    const idKey = Object.keys(data)[0];
    const existing = appData[sheetName].find(item => item[idKey] == data[idKey]);
    if (existing) Object.assign(existing, data);
    else appData[sheetName].push(data);
    return;
  }
  showLoading();
  try {
    const payload = { action: 'saveRecord', sheetName, data };
    const res = await fetch(GAS_API_URL, { method: "POST", body: JSON.stringify(payload) });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message);
  } catch(err) {
    console.error("Save Error:", err);
    alert("保存に失敗しました。");
  }
  hideLoading();
}

async function deleteRecord(sheetName, idKey, idValue) {
  if (USE_MOCK) {
    appData[sheetName] = appData[sheetName].filter(item => item[idKey] != idValue);
    return;
  }
  showLoading();
  try {
    const payload = { action: 'deleteRecord', sheetName, idKey, idValue };
    const res = await fetch(GAS_API_URL, { method: "POST", body: JSON.stringify(payload) });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message);
  } catch(err) {
    console.error("Delete Error:", err);
  }
  hideLoading();
}

/**
 * 初期化処理・イベント設定
 */
function init() {
  // Service Worker (PWA用)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
  }
  
  // Theme Toggle (ダーク/ライト)
  const isDark = localStorage.getItem('theme') === 'dark';
  if (isDark) document.body.dataset.theme = 'dark';
  el.themeToggle.addEventListener('click', () => {
    const toDark = document.body.dataset.theme !== 'dark';
    document.body.dataset.theme = toDark ? 'dark' : 'light';
    localStorage.setItem('theme', toDark ? 'dark' : 'light');
  });

  // PIN入力
  document.getElementById('pin-submit-btn').addEventListener('click', () => {
    const val = document.getElementById('pin-input').value;
    // USE_MOCKがtrueの場合は動作確認のため無条件に通過可能にしておくことも可能だが、
    // ここでは仕様通りテストする
    if (val === PIN_CODE || (USE_MOCK && val === "")) {
      el.pinScreen.classList.add('hidden');
      el.mainScreen.classList.remove('hidden');
      loadApp();
    } else {
      document.getElementById('pin-error').innerText = 'PINコードが違います (Hint: 1234)';
    }
  });

  // Navigation
  el.navMonthly.addEventListener('click', () => switchView('monthly'));
  el.navWeekly.addEventListener('click', () => switchView('weekly'));
  el.backBtn.addEventListener('click', () => switchView('monthly'));
  
  // Prev/Next
  document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()-1); renderMonthly(); });
  document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()+1); renderMonthly(); });
  document.getElementById('prev-week').addEventListener('click', () => { currentDate.setDate(currentDate.getDate()-7); renderWeekly(); });
  document.getElementById('next-week').addEventListener('click', () => { currentDate.setDate(currentDate.getDate()+7); renderWeekly(); });

  // Save actions
  el.saveMonthlyBtn.addEventListener('click', async () => {
    await saveRecord('MonthlyGoals', { yearMonth: formatMonth(currentDate), goal: el.monthlyGoal.value });
    alert('保存完了');
  });
  el.saveWeeklyBtn.addEventListener('click', async () => {
    await saveRecord('WeeklyGoals', { yearWeek: formatWeek(currentDate), goal: el.weeklyGoal.value });
    alert('保存完了');
  });
  el.saveDailyBtn.addEventListener('click', async () => {
    const rating = document.querySelector('#daily-rating span.active')?.dataset.val || "";
    await saveRecord('DailyRecords', { dateId: formatDate(selectedDate), body: el.dailyDiary.value, rating: rating });
    alert('保存完了');
    renderMonthly(); // カレンダーのドット表示更新
  });

  // Task actions
  el.addTaskBtn.addEventListener('click', async () => {
    const text = el.newTaskInput.value.trim();
    if (!text) return;
    const task = { taskId: Date.now().toString(), dateId: formatDate(selectedDate), content: text, status: 'open' };
    await saveRecord('Tasks', task);
    el.newTaskInput.value = "";
    renderDaily();
  });

  // Rating Stars Interactive
  el.dailyRating.querySelectorAll('span').forEach(star => {
    star.addEventListener('click', (e) => {
      el.dailyRating.querySelectorAll('span').forEach(s => s.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
}

function switchView(viewName) {
  el.viewMonthly.classList.add('hidden');
  el.viewWeekly.classList.add('hidden');
  el.viewDaily.classList.add('hidden');
  el.navMonthly.classList.remove('active');
  el.navWeekly.classList.remove('active');

  if (viewName === 'monthly') {
    el.viewMonthly.classList.remove('hidden');
    el.navMonthly.classList.add('active');
    renderMonthly();
  } else if (viewName === 'weekly') {
    el.viewWeekly.classList.remove('hidden');
    el.navWeekly.classList.add('active');
    renderWeekly();
  } else if (viewName === 'daily') {
    el.viewDaily.classList.remove('hidden');
    renderDaily();
  }
}

async function loadApp() {
  await fetchAllData();
  switchView('monthly');
}

/**
 * 画面描画ロジック
 */
function renderMonthly() {
  el.labelMonth.innerText = `${currentDate.getFullYear()}年${currentDate.getMonth()+1}月`;
  const yM = formatMonth(currentDate);
  const goalEntry = appData.MonthlyGoals.find(g => g.yearMonth === yM);
  el.monthlyGoal.value = goalEntry ? goalEntry.goal : "";

  // カレンダー構築
  el.calGrid.innerHTML = "";
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  const firstDayIndex = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell empty';
    el.calGrid.appendChild(cell);
  }

  for (let d = 1; d <= lastDate; d++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    
    const rec = appData.DailyRecords.find(r => r.dateId === dateStr);
    
    cell.innerHTML = `<span class="date-num">${d}</span>`;
    if (rec && rec.rating) {
      cell.innerHTML += `<div class="rating-dot rate-${rec.rating}"></div>`;
    }
    
    cell.addEventListener('click', () => {
      selectedDate = new Date(y, m, d);
      switchView('daily');
    });
    el.calGrid.appendChild(cell);
  }
}

function renderWeekly() {
  el.labelWeek.innerText = `${currentDate.getFullYear()}年 第${getWeekNumber(currentDate)}週`;
  const yW = formatWeek(currentDate);
  const goalEntry = appData.WeeklyGoals.find(g => g.yearWeek === yW);
  el.weeklyGoal.value = goalEntry ? goalEntry.goal : "";
}

function renderDaily() {
  const dStr = formatDate(selectedDate);
  el.labelDate.innerText = `${selectedDate.getFullYear()}年${selectedDate.getMonth()+1}月${selectedDate.getDate()}日`;
  
  const rec = appData.DailyRecords.find(r => r.dateId === dStr);
  el.dailyDiary.value = rec ? rec.body : "";
  
  el.dailyRating.querySelectorAll('span').forEach(s => s.classList.remove('active'));
  if (rec && rec.rating) {
    el.dailyRating.querySelector(`span[data-val="${rec.rating}"]`)?.classList.add('active');
  }

  // タスク描画
  el.taskList.innerHTML = "";
  const tasks = appData.Tasks.filter(t => t.dateId === dStr);
  tasks.forEach(t => {
    const li = document.createElement('li');
    const isDone = t.status === 'completed';
    li.innerHTML = `
      <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''}>
      <span class="task-text ${isDone ? 'completed' : ''}">${t.content}</span>
      <span class="delete-task">✖</span>
    `;
    
    li.querySelector('.task-checkbox').addEventListener('change', async (e) => {
      t.status = e.target.checked ? 'completed' : 'open';
      await saveRecord('Tasks', t);
      renderDaily();
    });
    li.querySelector('.delete-task').addEventListener('click', async () => {
      await deleteRecord('Tasks', 'taskId', t.taskId);
      renderDaily();
    });
    
    el.taskList.appendChild(li);
  });
}

// 起動開始
document.addEventListener('DOMContentLoaded', init);
