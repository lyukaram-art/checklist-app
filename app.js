import { firebaseConfig, vapidKey } from './firebase-config.js';

const LOCAL_TASKS_KEY = 'checklist_tasks';
const LOCAL_HISTORY_KEY = 'checklist_history';
const LOCAL_ROOM_KEY = 'checklist_room_code';
const LOCAL_NOTE_UNITS_KEY = 'checklist_note_units';
const LOCAL_NOTES_KEY = 'checklist_notes';

const els = {
  syncBtn: document.getElementById('syncBtn'),
  notifyBtn: document.getElementById('notifyBtn'),
  notifyStatus: document.getElementById('notifyStatus'),
  syncPanel: document.getElementById('syncPanel'),
  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  copyCodeBtn: document.getElementById('copyCodeBtn'),
  joinCodeInput: document.getElementById('joinCodeInput'),
  joinBtn: document.getElementById('joinBtn'),
  syncStatus: document.getElementById('syncStatus'),
  addForm: document.getElementById('addForm'),
  taskInput: document.getElementById('taskInput'),
  taskType: document.getElementById('taskType'),
  taskDateInput: document.getElementById('taskDateInput'),
  taskWeekdayInput: document.getElementById('taskWeekdayInput'),
  taskCategoryInput: document.getElementById('taskCategoryInput'),
  categoryBtns: document.querySelectorAll('.cat-btn'),
  dailyList: document.getElementById('dailyList'),
  weeklyList: document.getElementById('weeklyList'),
  dateList: document.getElementById('dateList'),
  todayTabBtn: document.getElementById('todayTabBtn'),
  calendarTabBtn: document.getElementById('calendarTabBtn'),
  todayView: document.getElementById('todayView'),
  calendarView: document.getElementById('calendarView'),
  prevMonthBtn: document.getElementById('prevMonthBtn'),
  nextMonthBtn: document.getElementById('nextMonthBtn'),
  calendarMonthLabel: document.getElementById('calendarMonthLabel'),
  calendarGrid: document.getElementById('calendarGrid'),
  dayDetail: document.getElementById('dayDetail'),
  dayDetailTitle: document.getElementById('dayDetailTitle'),
  dayDetailList: document.getElementById('dayDetailList'),
  gameExpFill: document.getElementById('gameExpFill'),
  gameExpLabel: document.getElementById('gameExpLabel'),
  studyExpFill: document.getElementById('studyExpFill'),
  studyExpLabel: document.getElementById('studyExpLabel'),
  gameLevelValue: document.getElementById('gameLevelValue'),
  gameLevelDays: document.getElementById('gameLevelDays'),
  studyLevelValue: document.getElementById('studyLevelValue'),
  studyLevelDays: document.getElementById('studyLevelDays'),
  notesTabBtn: document.getElementById('notesTabBtn'),
  notesView: document.getElementById('notesView'),
  addUnitForm: document.getElementById('addUnitForm'),
  unitInput: document.getElementById('unitInput'),
  unitFilter: document.getElementById('unitFilter'),
  noteSearchInput: document.getElementById('noteSearchInput'),
  addNoteForm: document.getElementById('addNoteForm'),
  noteTitleInput: document.getElementById('noteTitleInput'),
  noteContentInput: document.getElementById('noteContentInput'),
  noteAddHint: document.getElementById('noteAddHint'),
  notesList: document.getElementById('notesList'),
};

let tasks = loadLocalTasks();
let history = loadLocalHistory();
let noteUnits = loadLocalNoteUnits();
let notes = loadLocalNotes();
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDayKey = null;
let categoryFilter = 'all';
let selectedUnitId = 'all';
let noteSearchQuery = '';
let roomCode = localStorage.getItem(LOCAL_ROOM_KEY) || generateRoomCode();
localStorage.setItem(LOCAL_ROOM_KEY, roomCode);
els.roomCodeDisplay.textContent = roomCode;

let firebaseReady = false;
let firebaseApp = null;
let db = null;
let docRef = null;
let unsubscribe = null;
let suppressNextWrite = false;
let fsMod = null;

const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function currentPeriodKey(type) {
  const now = new Date();
  return type === 'weekly' ? getWeekKey(now) : getDayKey(now);
}

function resetIfNeeded(list) {
  let changed = false;
  for (const t of list) {
    if (t.type === 'date') continue;
    const period = currentPeriodKey(t.type);
    if (t.lastReset !== period) {
      if (t.checked) changed = true;
      t.checked = false;
      t.lastReset = period;
      changed = true;
    }
  }
  return changed;
}

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(LOCAL_TASKS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    resetIfNeeded(list);
    return list;
  } catch {
    return [];
  }
}

function loadLocalHistory() {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadLocalNoteUnits() {
  try {
    const raw = localStorage.getItem(LOCAL_NOTE_UNITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadLocalNotes() {
  try {
    const raw = localStorage.getItem(LOCAL_NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function weekdayOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function recordHistorySnapshot() {
  const key = getDayKey(new Date());
  const todayWeekday = new Date().getDay();
  history[key] = tasks
    .filter(t => {
      if (t.type === 'date') return false;
      if (t.type === 'weekly' && t.weekday !== undefined) return t.weekday === todayWeekday;
      return true;
    })
    .map(t => ({ id: t.id, text: t.text, type: t.type, category: t.category ?? null, checked: t.checked }));
}

function getDayItems(dateKey) {
  const snapshot = history[dateKey] || [];
  const seenIds = new Set(snapshot.map(t => t.id));
  const dateTasks = tasks
    .filter(t => t.type === 'date' && t.date === dateKey && !seenIds.has(t.id))
    .map(t => ({ id: t.id, text: t.text, type: t.type, category: t.category ?? null, checked: t.checked }));

  const todayKey = getDayKey(new Date());
  let upcoming = [];
  if (dateKey > todayKey) {
    const weekday = weekdayOf(dateKey);
    upcoming = tasks
      .filter(t => {
        if (seenIds.has(t.id)) return false;
        if (t.type === 'daily') return true;
        if (t.type === 'weekly') return t.weekday === weekday;
        return false;
      })
      .map(t => ({ id: t.id, text: t.text, type: t.type, category: t.category ?? null, checked: false }));
  }

  return [...snapshot, ...dateTasks, ...upcoming];
}

function saveLocal() {
  localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(history));
  localStorage.setItem(LOCAL_NOTE_UNITS_KEY, JSON.stringify(noteUnits));
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes));
}

async function saveRemote() {
  if (!firebaseReady || !docRef) return;
  suppressNextWrite = true;
  await fsMod.setDoc(docRef, { items: tasks, history, noteUnits, notes, updatedAt: Date.now() }, { merge: true });
}

function persist() {
  recordHistorySnapshot();
  saveLocal();
  saveRemote();
  if (!els.calendarView.classList.contains('hidden')) renderCalendar();
  if (!els.notesView.classList.contains('hidden')) renderNotes();
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function visibleTasks() {
  return categoryFilter === 'all' ? tasks : tasks.filter(t => t.category === categoryFilter);
}

function render() {
  recordHistorySnapshot();
  const visible = visibleTasks();
  const todayKey = getDayKey(new Date());
  const todayWeekday = new Date().getDay();

  const dailyTasks = visible.filter(t => t.type === 'daily');
  renderList(els.dailyList, dailyTasks);

  const weeklyTasks = visible
    .filter(t => t.type === 'weekly' && (t.weekday === undefined || t.weekday === todayWeekday))
    .sort((a, b) => (a.weekday ?? 7) - (b.weekday ?? 7));
  renderList(els.weeklyList, weeklyTasks, { showWeekday: true });

  const dateTasks = visible
    .filter(t => t.type === 'date' && (
      t.date === todayKey ||
      (t.category === 'study' && !t.checked && t.date < todayKey)
    ))
    .sort((a, b) => a.date.localeCompare(b.date));
  renderList(els.dateList, dateTasks, { showDate: true });

  renderExpBars(getTodayItemsAll(todayKey, todayWeekday));
  renderLevels();
}

function getTodayItemsAll(todayKey, todayWeekday) {
  const daily = tasks.filter(t => t.type === 'daily');
  const weekly = tasks.filter(t => t.type === 'weekly' && (t.weekday === undefined || t.weekday === todayWeekday));
  const date = tasks.filter(t => t.type === 'date' && (
    t.date === todayKey ||
    (t.category === 'study' && !t.checked && t.date < todayKey)
  ));
  return [...daily, ...weekly, ...date];
}

function computeCategoryLevels() {
  const clearDays = { game: 0, study: 0 };
  for (const dateKey of Object.keys(history)) {
    const items = getDayItems(dateKey);
    for (const cat of ['game', 'study']) {
      const catItems = items.filter(t => t.category === cat);
      if (catItems.length > 0 && catItems.every(t => t.checked)) {
        clearDays[cat] += 1;
      }
    }
  }
  return {
    game: { days: clearDays.game, level: clearDays.game + 1 },
    study: { days: clearDays.study, level: clearDays.study + 1 },
  };
}

function renderLevels() {
  const levels = computeCategoryLevels();
  els.gameLevelValue.textContent = `Lv.${levels.game.level}`;
  els.gameLevelDays.textContent = `완료한 날 ${levels.game.days}일`;
  els.studyLevelValue.textContent = `Lv.${levels.study.level}`;
  els.studyLevelDays.textContent = `완료한 날 ${levels.study.days}일`;
}

function renderExpBars(todayItems) {
  for (const cat of ['game', 'study']) {
    const items = todayItems.filter(t => t.category === cat);
    const total = items.length;
    const done = items.filter(t => t.checked).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const label = cat === 'game' ? '게임' : '학업';
    els[`${cat}ExpFill`].style.width = `${pct}%`;
    els[`${cat}ExpLabel`].textContent = `${label} 경험치 ${pct}%`;
  }
}

function formatDateShort(dateKey) {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function renderList(ul, list, { showDate = false, showWeekday = false } = {}) {
  ul.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = '아직 할 일이 없어요.';
    ul.appendChild(li);
    return;
  }
  const todayKey = getDayKey(new Date());
  const todayWeekday = new Date().getDay();
  for (const t of list) {
    const li = document.createElement('li');
    const overdue = showDate && !t.checked && t.date < todayKey;
    const dueToday = showWeekday && t.weekday !== undefined && t.weekday === todayWeekday && !t.checked;
    const catClass = t.category ? ` cat-${t.category}` : '';
    li.className = 'task-item' + (t.checked ? ' done' : '') + (overdue ? ' overdue' : '') + (dueToday ? ' due-today' : '') + catClass;

    const check = document.createElement('button');
    check.className = 'task-check' + (t.checked ? ' checked' : '');
    check.textContent = t.checked ? '✓' : '';
    check.addEventListener('click', () => toggleTask(t.id));

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = t.text;

    li.appendChild(check);

    if (showDate) {
      const badge = document.createElement('span');
      badge.className = 'date-badge';
      badge.textContent = formatDateShort(t.date);
      li.appendChild(badge);
    }

    if (showWeekday && t.weekday !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'date-badge';
      badge.textContent = `매주 ${WEEKDAY_LABELS[t.weekday]}요일`;
      li.appendChild(badge);
    }

    li.appendChild(text);

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => deleteTask(t.id));
    li.appendChild(del);

    ul.appendChild(li);
  }
}

function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.checked = !t.checked;
  if (t.type !== 'date') t.lastReset = currentPeriodKey(t.type);
  render();
  persist();
}

function deleteTask(id) {
  tasks = tasks.filter(x => x.id !== id);
  render();
  persist();
}

function addTask(text, type, extra) {
  const task = {
    id: crypto.randomUUID(),
    text,
    type,
    category: extra.category,
    checked: false,
  };
  if (type === 'date') {
    task.date = extra.date;
  } else {
    task.lastReset = currentPeriodKey(type);
    if (type === 'weekly' && extra.weekday !== '') {
      task.weekday = Number(extra.weekday);
    }
  }
  tasks.push(task);
  render();
  persist();
}

els.categoryBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    categoryFilter = btn.dataset.category;
    els.categoryBtns.forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
});

els.taskType.addEventListener('change', () => {
  const type = els.taskType.value;
  els.taskDateInput.classList.toggle('hidden', type !== 'date');
  els.taskWeekdayInput.classList.toggle('hidden', type !== 'weekly');
  if (type === 'date' && !els.taskDateInput.value) {
    els.taskDateInput.value = getDayKey(new Date());
  }
});

els.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.taskInput.value.trim();
  if (!text) return;
  const type = els.taskType.value;
  if (type === 'date' && !els.taskDateInput.value) {
    els.taskDateInput.focus();
    return;
  }
  addTask(text, type, {
    date: els.taskDateInput.value,
    weekday: els.taskWeekdayInput.value,
    category: els.taskCategoryInput.value,
  });
  els.taskInput.value = '';
  els.taskInput.focus();
});

function addUnit(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  noteUnits.push({ id: crypto.randomUUID(), name: trimmed });
  persist();
}

function deleteUnit(id) {
  if (!confirm('이 단원과 안의 노트를 모두 삭제할까요?')) return;
  noteUnits = noteUnits.filter(u => u.id !== id);
  notes = notes.filter(n => n.unitId !== id);
  if (selectedUnitId === id) selectedUnitId = 'all';
  persist();
}

function addNote(unitId, title, content) {
  notes.push({
    id: crypto.randomUUID(),
    unitId,
    title: title.trim(),
    content: content.trim(),
    createdAt: Date.now(),
    reviewed: false,
  });
  persist();
}

function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  persist();
}

function toggleNoteReviewed(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  n.reviewed = !n.reviewed;
  persist();
}

function unitName(unitId) {
  return noteUnits.find(u => u.id === unitId)?.name || '(삭제된 단원)';
}

function noteMatchesSearch(n) {
  if (!noteSearchQuery) return true;
  const q = noteSearchQuery.toLowerCase();
  return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
}

function visibleNotes() {
  return notes
    .filter(n => selectedUnitId === 'all' || n.unitId === selectedUnitId)
    .filter(noteMatchesSearch)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function renderUnitFilter() {
  els.unitFilter.querySelectorAll('[data-dynamic-unit]').forEach(b => b.remove());
  for (const u of noteUnits) {
    const btn = document.createElement('button');
    btn.className = 'cat-btn unit-chip' + (selectedUnitId === u.id ? ' active' : '');
    btn.dataset.dynamicUnit = 'true';
    btn.dataset.unitId = u.id;

    const label = document.createElement('span');
    label.textContent = u.name;
    btn.appendChild(label);

    const del = document.createElement('span');
    del.className = 'unit-chip-delete';
    del.textContent = '✕';
    btn.appendChild(del);

    els.unitFilter.appendChild(btn);
  }
  els.unitFilter.querySelector('[data-unit-id="all"]').classList.toggle('active', selectedUnitId === 'all');
}

function renderNotes() {
  renderUnitFilter();

  const hasUnits = noteUnits.length > 0;
  const canAdd = hasUnits && selectedUnitId !== 'all';
  els.addNoteForm.classList.toggle('hidden', !canAdd);
  els.noteAddHint.classList.toggle('hidden', canAdd);
  if (!canAdd) {
    els.noteAddHint.textContent = hasUnits
      ? '단원을 선택하면 노트를 추가할 수 있어요.'
      : '먼저 위에서 단원(폴더)을 추가해 주세요.';
  }

  const list = visibleNotes();
  els.notesList.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = '아직 노트가 없어요.';
    els.notesList.appendChild(li);
    return;
  }

  for (const n of list) {
    const li = document.createElement('li');
    li.className = 'note-item' + (n.reviewed ? ' reviewed' : '');

    const header = document.createElement('div');
    header.className = 'note-header';

    const check = document.createElement('button');
    check.className = 'task-check' + (n.reviewed ? ' checked' : '');
    check.title = '복습 완료 표시';
    check.textContent = n.reviewed ? '✓' : '';
    check.addEventListener('click', () => toggleNoteReviewed(n.id));
    header.appendChild(check);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'note-title-wrap';
    const title = document.createElement('span');
    title.className = 'note-title';
    title.textContent = n.title;
    titleWrap.appendChild(title);
    if (selectedUnitId === 'all') {
      const badge = document.createElement('span');
      badge.className = 'date-badge';
      badge.textContent = unitName(n.unitId);
      titleWrap.appendChild(badge);
    }
    header.appendChild(titleWrap);

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => deleteNote(n.id));
    header.appendChild(del);

    li.appendChild(header);

    const body = document.createElement('p');
    body.className = 'note-content hidden';
    body.textContent = n.content;
    li.appendChild(body);

    titleWrap.addEventListener('click', () => body.classList.toggle('hidden'));

    els.notesList.appendChild(li);
  }
}

els.addUnitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addUnit(els.unitInput.value);
  els.unitInput.value = '';
});

els.unitFilter.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.unit-chip-delete');
  if (delBtn) {
    e.stopPropagation();
    deleteUnit(delBtn.closest('[data-unit-id]').dataset.unitId);
    return;
  }
  const chip = e.target.closest('[data-unit-id]');
  if (!chip) return;
  selectedUnitId = chip.dataset.unitId;
  renderNotes();
});

els.addNoteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (selectedUnitId === 'all') return;
  const title = els.noteTitleInput.value.trim();
  const content = els.noteContentInput.value.trim();
  if (!title || !content) return;
  addNote(selectedUnitId, title, content);
  els.noteTitleInput.value = '';
  els.noteContentInput.value = '';
  els.noteTitleInput.focus();
});

els.noteSearchInput.addEventListener('input', () => {
  noteSearchQuery = els.noteSearchInput.value;
  renderNotes();
});

els.notesTabBtn.addEventListener('click', () => switchTab('notes'));

els.syncBtn.addEventListener('click', () => {
  els.syncPanel.classList.toggle('hidden');
});

els.copyCodeBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    setStatus('코드가 복사되었어요.');
  } catch {
    setStatus('복사에 실패했어요. 직접 입력해 주세요.');
  }
});

els.joinBtn.addEventListener('click', async () => {
  const code = els.joinCodeInput.value.trim().toUpperCase();
  if (!code || code.length < 4) {
    setStatus('올바른 코드를 입력해 주세요.');
    return;
  }
  roomCode = code;
  localStorage.setItem(LOCAL_ROOM_KEY, roomCode);
  els.roomCodeDisplay.textContent = roomCode;
  els.joinCodeInput.value = '';
  if (firebaseReady) {
    await connectRoom(roomCode, { adopt: true });
  }
  setStatus(`${roomCode} 기기와 연결되었어요.`);
});

function setStatus(msg) {
  els.syncStatus.textContent = msg;
}

function periodicResetCheck() {
  if (resetIfNeeded(tasks)) {
    render();
    persist();
  }
}
setInterval(periodicResetCheck, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') periodicResetCheck();
});

async function connectRoom(code, { adopt = false } = {}) {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  docRef = fsMod.doc(db, 'checklists', code);

  if (adopt) {
    const snap = await fsMod.getDoc(docRef);
    if (snap.exists()) {
      tasks = snap.data().items || [];
      history = snap.data().history || {};
      noteUnits = snap.data().noteUnits || [];
      notes = snap.data().notes || [];
      resetIfNeeded(tasks);
      render();
      renderCalendar();
      renderNotes();
      saveLocal();
    } else {
      await fsMod.setDoc(docRef, { items: tasks, history, noteUnits, notes, updatedAt: Date.now() });
    }
  } else {
    const snap = await fsMod.getDoc(docRef);
    if (!snap.exists()) {
      await fsMod.setDoc(docRef, { items: tasks, history, noteUnits, notes, updatedAt: Date.now() });
    } else {
      tasks = snap.data().items || [];
      history = snap.data().history || {};
      noteUnits = snap.data().noteUnits || [];
      notes = snap.data().notes || [];
      resetIfNeeded(tasks);
      render();
      renderCalendar();
      renderNotes();
      saveLocal();
    }
  }

  unsubscribe = fsMod.onSnapshot(docRef, (snap) => {
    if (suppressNextWrite) {
      suppressNextWrite = false;
      return;
    }
    if (!snap.exists()) return;
    tasks = snap.data().items || [];
    history = snap.data().history || {};
    noteUnits = snap.data().noteUnits || [];
    notes = snap.data().notes || [];
    resetIfNeeded(tasks);
    render();
    renderCalendar();
    renderNotes();
    saveLocal();
  });
}

async function initFirebase() {
  if (!isConfigured) {
    setStatus('Firebase가 아직 설정되지 않아 이 기기에만 저장돼요.');
    return;
  }
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    fsMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    firebaseApp = app;
    const auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);

    await new Promise((resolve) => {
      authMod.onAuthStateChanged(auth, (user) => {
        if (user) resolve();
      });
      authMod.signInAnonymously(auth).catch((err) => {
        setStatus('로그인 실패: ' + err.message);
      });
    });

    firebaseReady = true;
    await connectRoom(roomCode);
    setStatus('연동 완료! 이 코드로 다른 기기에서도 접속할 수 있어요.');

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      els.notifyBtn.classList.add('on');
      ensureForegroundMessaging().catch((err) => console.error(err));
    }
  } catch (err) {
    console.error(err);
    setStatus('연동 실패: ' + err.message);
  }
}

function setNotifyStatus(msg) {
  els.notifyStatus.textContent = msg;
  els.notifyStatus.classList.remove('hidden');
}

let foregroundMessagingReady = false;

async function ensureForegroundMessaging() {
  if (foregroundMessagingReady || !firebaseApp) return;
  const messagingMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
  const messaging = messagingMod.getMessaging(firebaseApp);
  messagingMod.onMessage(messaging, (payload) => {
    const title = payload.notification?.title || '체크리스트';
    const body = payload.notification?.body || '';
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: 'icon.svg' }));
  });
  foregroundMessagingReady = true;
}

els.notifyBtn.addEventListener('click', async () => {
  if (!firebaseReady) {
    setNotifyStatus('Firebase 연동 후에 알림을 켤 수 있어요.');
    return;
  }
  if (!vapidKey || vapidKey === 'YOUR_VAPID_KEY') {
    setNotifyStatus('알림 기능이 아직 설정되지 않았어요.');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setNotifyStatus('알림 권한이 허용되지 않았어요.');
      return;
    }
    const messagingMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
    const messaging = messagingMod.getMessaging(firebaseApp);
    const swReg = await navigator.serviceWorker.ready;
    const token = await messagingMod.getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
    await fsMod.setDoc(docRef, { pushTokens: fsMod.arrayUnion(token) }, { merge: true });
    await ensureForegroundMessaging();
    els.notifyBtn.classList.add('on');
    setNotifyStatus('알림이 켜졌어요. 매일 정해진 시간에 남은 할 일을 알려드려요.');
  } catch (err) {
    console.error(err);
    setNotifyStatus('알림 설정 실패: ' + err.message);
  }
});

els.todayTabBtn.addEventListener('click', () => switchTab('today'));
els.calendarTabBtn.addEventListener('click', () => switchTab('calendar'));

function switchTab(tab) {
  els.todayTabBtn.classList.toggle('active', tab === 'today');
  els.calendarTabBtn.classList.toggle('active', tab === 'calendar');
  els.notesTabBtn.classList.toggle('active', tab === 'notes');
  els.todayView.classList.toggle('hidden', tab !== 'today');
  els.calendarView.classList.toggle('hidden', tab !== 'calendar');
  els.notesView.classList.toggle('hidden', tab !== 'notes');
  if (tab === 'calendar') renderCalendar();
  if (tab === 'notes') renderNotes();
}

els.prevMonthBtn.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

els.nextMonthBtn.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

function renderCalendar() {
  els.calendarMonthLabel.textContent = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  els.calendarGrid.innerHTML = '';

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = getDayKey(new Date());

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    els.calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = getDayKey(new Date(year, month, day));
    const items = getDayItems(dateKey);

    const cell = document.createElement('button');
    let statusClass = '';
    if (items.length > 0) {
      const done = items.filter(t => t.checked).length;
      statusClass = done === items.length ? 'full' : done > 0 ? 'partial' : 'none';
    }
    cell.className = `calendar-day ${statusClass}` +
      (dateKey === todayKey ? ' today' : '') +
      (dateKey === selectedDayKey ? ' selected' : '');

    const num = document.createElement('span');
    num.textContent = String(day);
    cell.appendChild(num);

    if (items.length > 0) {
      const dot = document.createElement('i');
      dot.className = 'dot';
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => selectDay(dateKey));
    els.calendarGrid.appendChild(cell);
  }

  if (selectedDayKey) showDayDetail(selectedDayKey);
}

function selectDay(dateKey) {
  selectedDayKey = dateKey;
  renderCalendar();
  showDayDetail(dateKey);
}

function showDayDetail(dateKey) {
  const snapshot = getDayItems(dateKey);
  els.dayDetail.classList.remove('hidden');
  const [y, m, d] = dateKey.split('-');
  els.dayDetailTitle.textContent = `${y}년 ${Number(m)}월 ${Number(d)}일`;
  els.dayDetailList.innerHTML = '';

  if (!snapshot || snapshot.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = '기록이 없어요.';
    els.dayDetailList.appendChild(li);
    return;
  }

  for (const t of snapshot) {
    const li = document.createElement('li');
    const catClass = t.category ? ` cat-${t.category}` : '';
    li.className = 'task-item' + (t.checked ? ' done' : '') + catClass;

    const check = document.createElement('span');
    check.className = 'task-check readonly' + (t.checked ? ' checked' : '');
    check.textContent = t.checked ? '✓' : '';

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = t.text;

    li.appendChild(check);
    li.appendChild(text);
    els.dayDetailList.appendChild(li);
  }
}

recordHistorySnapshot();
saveLocal();
render();
renderNotes();
initFirebase();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { type: 'module' }).catch(() => {});
  });
}
