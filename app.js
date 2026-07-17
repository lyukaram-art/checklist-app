import { firebaseConfig, vapidKey } from './firebase-config.js';

const LOCAL_TASKS_KEY = 'checklist_tasks';
const LOCAL_HISTORY_KEY = 'checklist_history';
const LOCAL_ROOM_KEY = 'checklist_room_code';
const LOCAL_NOTE_UNITS_KEY = 'checklist_note_units';
const LOCAL_NOTE_TAGS_KEY = 'checklist_note_tags';
const LOCAL_NOTES_KEY = 'checklist_notes';
const LOCAL_THEME_KEY = 'checklist_theme';

const els = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
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
  tagFilterBar: document.getElementById('tagFilterBar'),
  bookTagPicker: document.getElementById('bookTagPicker'),
  unitTagPicker: document.getElementById('unitTagPicker'),
  noteSearchInput: document.getElementById('noteSearchInput'),
  noteSortSelect: document.getElementById('noteSortSelect'),
  addNoteForm: document.getElementById('addNoteForm'),
  noteTitleInput: document.getElementById('noteTitleInput'),
  noteContentInput: document.getElementById('noteContentInput'),
  noteImageInput: document.getElementById('noteImageInput'),
  noteImagePreviewWrap: document.getElementById('noteImagePreviewWrap'),
  noteImagePreview: document.getElementById('noteImagePreview'),
  noteImageRemoveBtn: document.getElementById('noteImageRemoveBtn'),
  noteAddHint: document.getElementById('noteAddHint'),
  notesList: document.getElementById('notesList'),
  reviewBtn: document.getElementById('reviewBtn'),
  analysisBtn: document.getElementById('analysisBtn'),
  analysisPanel: document.getElementById('analysisPanel'),
  reviewSetupPanel: document.getElementById('reviewSetupPanel'),
  reviewTagCheckboxes: document.getElementById('reviewTagCheckboxes'),
  reviewCountInput: document.getElementById('reviewCountInput'),
  startReviewBtn: document.getElementById('startReviewBtn'),
  reviewSetupHint: document.getElementById('reviewSetupHint'),
  reviewPlayPanel: document.getElementById('reviewPlayPanel'),
  reviewProgress: document.getElementById('reviewProgress'),
  reviewCardTitle: document.getElementById('reviewCardTitle'),
  reviewCardMeta: document.getElementById('reviewCardMeta'),
  reviewCardContent: document.getElementById('reviewCardContent'),
  reviewCardImage: document.getElementById('reviewCardImage'),
  revealBtn: document.getElementById('revealBtn'),
  reviewGradeRow: document.getElementById('reviewGradeRow'),
  gradeForgotBtn: document.getElementById('gradeForgotBtn'),
  gradeRememberedBtn: document.getElementById('gradeRememberedBtn'),
  reviewEndBtn: document.getElementById('reviewEndBtn'),
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) metaThemeColor.content = theme === 'dark' ? '#1C140D' : '#E4572E';
}

applyTheme(document.documentElement.dataset.theme || 'light');

els.themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(LOCAL_THEME_KEY, next);
  applyTheme(next);
});

let tasks = loadLocalTasks();
let history = loadLocalHistory();
let noteUnits = loadLocalNoteUnits();
let notes = loadLocalNotes();
let noteTags = loadLocalNoteTags();
if (noteTags === null) migrateFoldersToTags();
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDayKey = null;
let categoryFilter = 'all';
let noteSearchQuery = '';
let noteSortMode = 'recent';
let editingNoteId = null;
let pendingNoteImage = null;
const activeFilterTagIds = new Set();
const pendingNoteTagIds = new Set();
const expandedUnitIds = new Set();
let tagManageMode = false;
let reviewQueue = [];
let reviewIndex = 0;
let reviewSessionGrades = [];
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

function loadLocalNoteTags() {
  try {
    const raw = localStorage.getItem(LOCAL_NOTE_TAGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
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
  localStorage.setItem(LOCAL_NOTE_TAGS_KEY, JSON.stringify(noteTags || []));
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes));
}

async function saveRemote() {
  if (!firebaseReady || !docRef) return;
  suppressNextWrite = true;
  await fsMod.setDoc(docRef, { items: tasks, history, noteUnits, noteTags: noteTags || [], notes, updatedAt: Date.now() }, { merge: true });
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

// One-time migration: turn existing folders into 단원(unit) tags so no note is orphaned.
// Runs only when noteTags has never been stored (loadLocalNoteTags returned null).
// Reuses folder ids as tag ids and keeps noteUnits / note.unitId untouched as a safety net.
function migrateFoldersToTags() {
  const tags = (noteUnits || []).map(u => ({ id: u.id, name: u.name, category: 'unit' }));
  const validIds = new Set(tags.map(t => t.id));
  const pathIds = (unitId) => {
    const ids = [];
    let cur = (noteUnits || []).find(u => u.id === unitId);
    let guard = 0;
    while (cur && guard++ < 100) {
      ids.push(cur.id);
      cur = cur.parentId ? (noteUnits || []).find(u => u.id === cur.parentId) : null;
    }
    return ids;
  };
  for (const n of notes) {
    if (!Array.isArray(n.tagIds)) {
      n.tagIds = n.unitId ? pathIds(n.unitId).filter(id => validIds.has(id)) : [];
    }
  }
  noteTags = tags;
}

const TAG_CATEGORIES = ['book', 'unit'];

function tagsInCategory(category) {
  return (noteTags || []).filter(t => t.category === category);
}

function findTag(id) {
  return (noteTags || []).find(t => t.id === id) || null;
}

// 단원(unit) 계층 -------------------------------------------------
// A unit tag's parentId points to another unit tag (null/dangling = top level).
function unitParentId(tag) {
  if (!tag || tag.category !== 'unit' || !tag.parentId) return null;
  const p = findTag(tag.parentId);
  return p && p.category === 'unit' ? p.id : null;
}

function unitChildren(parentId) {
  return tagsInCategory('unit').filter(t => unitParentId(t) === parentId);
}

// Preorder list of every unit tag as { tag, depth }.
function unitTreeOrder() {
  const out = [];
  const walk = (parentId, depth) => {
    if (depth > 100) return;
    for (const t of unitChildren(parentId)) {
      out.push({ tag: t, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function unitDescendantIds(id) {
  const result = [];
  for (const child of unitChildren(id)) {
    result.push(child.id, ...unitDescendantIds(child.id));
  }
  return result;
}

function unitSubtreeIds(id) {
  return [id, ...unitDescendantIds(id)];
}

// Depth of a unit tag in the hierarchy (top-level = 0).
function unitDepth(tag) {
  let depth = 0;
  let cur = tag;
  let guard = 0;
  while (cur && unitParentId(cur) && guard++ < 100) {
    cur = findTag(unitParentId(cur));
    depth++;
  }
  return depth;
}

// Display order for a note's tags: 책 → 큰 단원(상위) → 작은 단원(하위).
function noteTagSortKey(tag) {
  return tag.category === 'book' ? 0 : 1 + unitDepth(tag);
}

// Ordered [{ tag, depth }] for a category: units as a tree, books flat.
function orderedTagsInCategory(category) {
  if (category === 'unit') return unitTreeOrder();
  return tagsInCategory(category).map(tag => ({ tag, depth: 0 }));
}

// Tag ids a selected tag should match: a unit also matches its descendants.
function tagEffectiveIds(tag) {
  return tag.category === 'unit' ? unitSubtreeIds(tag.id) : [tag.id];
}

// Units to show in a collapsible tree (children hidden until the parent opens).
// A parent auto-expands when it holds an item from activeSet — an active filter
// selection or a note's chosen tag — so a selection is never hidden.
function visibleUnitTree(activeSet, expandedSet) {
  const out = [];
  const walk = (parentId, depth) => {
    for (const t of unitChildren(parentId)) {
      const childCount = unitChildren(t.id).length;
      const autoOpen = unitDescendantIds(t.id).some(d => activeSet.has(d));
      const expanded = expandedSet.has(t.id) || autoOpen;
      out.push({ tag: t, depth, hasChildren: childCount > 0, expanded });
      if (childCount && expanded) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function noteTagObjects(n) {
  return (n.tagIds || [])
    .map(findTag)
    .filter(Boolean)
    .sort((a, b) => noteTagSortKey(a) - noteTagSortKey(b));
}

// Subtree-aware count: a 순환기 parent also counts notes tagged with its children.
function countNotesWithTag(tagId) {
  const tag = findTag(tagId);
  if (!tag) return 0;
  const ids = new Set(tagEffectiveIds(tag));
  return notes.filter(n => (n.tagIds || []).some(t => ids.has(t))).length;
}

function addTag(name, category) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = (noteTags || []).find(
    t => t.category === category && t.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return existing;
  const tag = { id: crypto.randomUUID(), name: trimmed, category, parentId: null };
  if (!noteTags) noteTags = [];
  noteTags.push(tag);
  persist();
  return tag;
}

function renameTag(id) {
  const tag = findTag(id);
  if (!tag) return;
  const name = prompt('새 태그 이름', tag.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  tag.name = trimmed;
  persist();
}

// Move a unit tag under another unit (or null for top level). Blocks cycles.
function setUnitParent(id, parentId) {
  const tag = findTag(id);
  if (!tag || tag.category !== 'unit') return;
  if (parentId === id) return;
  if (parentId && unitDescendantIds(id).includes(parentId)) return;
  if (parentId) {
    const p = findTag(parentId);
    if (!p || p.category !== 'unit') return;
  }
  tag.parentId = parentId || null;
  persist();
}

function deleteTag(id) {
  const tag = findTag(id);
  if (!tag) return;
  const directUsed = notes.filter(n => (n.tagIds || []).includes(id)).length;
  const hasChildren = tag.category === 'unit' && unitChildren(id).length > 0;
  let msg = `'${tag.name}' 태그를 삭제할까요?`;
  if (directUsed > 0) msg += ` ${directUsed}개 노트에서 이 태그가 제거돼요. (노트는 삭제되지 않아요)`;
  if (hasChildren) msg += ' 하위 단원은 상위 단계로 올라가요.';
  if (!confirm(msg)) return;
  const promoteTo = tag.parentId || null;
  noteTags = noteTags.filter(t => t.id !== id);
  for (const t of noteTags) {
    if (t.category === 'unit' && t.parentId === id) t.parentId = promoteTo;
  }
  for (const n of notes) {
    if (Array.isArray(n.tagIds)) n.tagIds = n.tagIds.filter(tid => tid !== id);
  }
  activeFilterTagIds.delete(id);
  pendingNoteTagIds.delete(id);
  persist();
}

function toggleTagCategory(id) {
  const tag = findTag(id);
  if (!tag) return;
  if (tag.category === 'unit') {
    // Becoming a book: detach from the hierarchy and promote its children.
    const promoteTo = tag.parentId || null;
    for (const t of noteTags) {
      if (t.category === 'unit' && t.parentId === id) t.parentId = promoteTo;
    }
    tag.parentId = null;
    tag.category = 'book';
  } else {
    tag.category = 'unit';
    tag.parentId = null;
  }
  persist();
}

function addNote(title, content, image, tagIds) {
  notes.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    content: content.trim(),
    image: image || null,
    tagIds: Array.isArray(tagIds) ? tagIds.slice() : [],
    createdAt: Date.now(),
    lastReviewedAt: null,
    reviewCount: 0,
    rememberedCount: 0,
  });
  persist();
}

function compressImageFile(file, maxDim = 700, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('이미지를 읽을 수 없어요.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없어요.'));
    reader.readAsDataURL(file);
  });
}

function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  persist();
}

function renameNote(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  const title = prompt('새 제목', n.title);
  if (title === null) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  n.title = trimmed;
  persist();
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatLastReviewed(ts) {
  if (!ts) return '복습한 적 없음';
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (days <= 0) return '오늘 복습함';
  if (days < 30) return `${days}일 전 복습`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전 복습`;
  return `${Math.floor(months / 12)}년 전 복습`;
}

function formatRememberRate(n) {
  const count = n.reviewCount || 0;
  if (count === 0) return '기억률 -';
  return `기억률 ${Math.round(((n.rememberedCount || 0) / count) * 100)}%`;
}

function noteMeta(n) {
  return `${formatLastReviewed(n.lastReviewedAt)} · ${formatRememberRate(n)}`;
}

function noteRateValue(n) {
  return n.reviewCount ? (n.rememberedCount || 0) / n.reviewCount : -1;
}

function rememberRateColor(n) {
  if (!n.reviewCount) return null;
  const rate = noteRateValue(n);
  const hue = rate * 210; // 0 = red (낮음), 210 = 파랑 (높음)
  return `hsl(${hue}, 70%, 45%)`;
}

function sortNotes(list) {
  const arr = list.slice();
  switch (noteSortMode) {
    case 'rateAsc':
      arr.sort((a, b) => noteRateValue(a) - noteRateValue(b));
      break;
    case 'rateDesc':
      arr.sort((a, b) => noteRateValue(b) - noteRateValue(a));
      break;
    case 'oldReview':
      arr.sort((a, b) => (a.lastReviewedAt || 0) - (b.lastReviewedAt || 0));
      break;
    default:
      arr.sort((a, b) => b.createdAt - a.createdAt);
  }
  return arr;
}

function reviewPriority(n) {
  const daysSince = n.lastReviewedAt ? (Date.now() - n.lastReviewedAt) / 86400000 : 9999;
  const rate = n.reviewCount ? (n.rememberedCount || 0) / n.reviewCount : 0;
  return daysSince * (1.1 - rate);
}

function weightedSample(pool, count) {
  const items = pool.map(n => ({ note: n, weight: Math.max(reviewPriority(n), 0.01) }));
  const picked = [];
  while (picked.length < count && items.length > 0) {
    const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      r -= items[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(items[idx].note);
    items.splice(idx, 1);
  }
  return picked;
}

function noteMatchesSearch(n) {
  if (!noteSearchQuery.trim()) return true;
  const q = noteSearchQuery.trim().toLowerCase();
  return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
}

// A note matches the tag filter when, for every category that has active tags,
// the note carries at least one of that category's selected tags (AND across
// categories, OR within a category).
function noteMatchesTagFilter(n) {
  if (activeFilterTagIds.size === 0) return true;
  const noteIds = new Set(n.tagIds || []);
  for (const category of TAG_CATEGORIES) {
    const selected = tagsInCategory(category).filter(t => activeFilterTagIds.has(t.id));
    if (selected.length && !selected.some(t => tagEffectiveIds(t).some(id => noteIds.has(id)))) return false;
  }
  return true;
}

function visibleNotes() {
  return notes.filter(n => noteMatchesSearch(n) && noteMatchesTagFilter(n));
}

const TAG_CATEGORY_META = {
  book: { label: '📖 책', addLabel: '＋ 새 책' },
  unit: { label: '🫀 단원', addLabel: '＋ 새 단원' },
};

function renderTagFilterBar() {
  els.tagFilterBar.innerHTML = '';
  const hasTags = (noteTags || []).length > 0;
  if (!hasTags) {
    els.tagFilterBar.classList.add('hidden');
    return;
  }
  els.tagFilterBar.classList.remove('hidden');

  if (tagManageMode) renderTagManageList();
  else renderTagFilterChips();

  const controls = document.createElement('div');
  controls.className = 'tag-filter-controls';

  if (!tagManageMode && activeFilterTagIds.size > 0) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tag-filter-clear';
    clear.dataset.action = 'clear';
    clear.textContent = '필터 해제';
    controls.appendChild(clear);
  }

  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'tag-filter-manage' + (tagManageMode ? ' active' : '');
  manage.dataset.action = 'manage';
  manage.textContent = tagManageMode ? '✓ 완료' : '⚙️ 태그 관리';
  controls.appendChild(manage);

  els.tagFilterBar.appendChild(controls);
}

function renderTagFilterChips() {
  for (const category of TAG_CATEGORIES) {
    // Units use a collapsible tree (children hidden until the parent is opened).
    const items = category === 'unit'
      ? visibleUnitTree(activeFilterTagIds, expandedUnitIds)
      : orderedTagsInCategory(category).map(o => ({ ...o, hasChildren: false, expanded: false }));
    if (items.length === 0) continue;

    const row = document.createElement('div');
    row.className = 'tag-filter-row';

    const label = document.createElement('span');
    label.className = 'tag-filter-label';
    label.textContent = TAG_CATEGORY_META[category].label;
    row.appendChild(label);

    for (const { tag, depth, hasChildren, expanded } of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip tag-' + category + (activeFilterTagIds.has(tag.id) ? ' active' : '');
      chip.dataset.tagId = tag.id;
      if (depth) chip.style.marginLeft = (depth * 14) + 'px';

      if (hasChildren) {
        const arrow = document.createElement('span');
        arrow.className = 'tag-expand';
        arrow.dataset.action = 'expand';
        arrow.textContent = expanded ? '▾' : '▸';
        chip.appendChild(arrow);
      }

      const name = document.createElement('span');
      name.className = 'tag-chip-name';
      name.textContent = `${tag.name} (${countNotesWithTag(tag.id)})`;
      chip.appendChild(name);

      row.appendChild(chip);
    }

    els.tagFilterBar.appendChild(row);
  }
}

function renderTagManageList() {
  for (const category of TAG_CATEGORIES) {
    const ordered = orderedTagsInCategory(category);
    if (ordered.length === 0) continue;

    const heading = document.createElement('p');
    heading.className = 'tag-manage-heading';
    heading.textContent = TAG_CATEGORY_META[category].label;
    els.tagFilterBar.appendChild(heading);

    for (const { tag, depth } of ordered) {
      const row = document.createElement('div');
      row.className = 'tag-manage-row';
      if (depth) row.style.marginLeft = (depth * 16) + 'px';

      const name = document.createElement('span');
      name.className = 'tag-manage-name tag-' + category;
      name.textContent = tag.name;
      row.appendChild(name);

      if (category === 'unit') {
        const sel = document.createElement('select');
        sel.className = 'tag-parent-select';
        sel.dataset.tagId = tag.id;
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '상위: 없음';
        sel.appendChild(none);
        const banned = new Set([tag.id, ...unitDescendantIds(tag.id)]);
        for (const { tag: cand, depth: d } of unitTreeOrder()) {
          if (banned.has(cand.id)) continue;
          const opt = document.createElement('option');
          opt.value = cand.id;
          opt.textContent = '상위: ' + '　'.repeat(d) + cand.name;
          if (unitParentId(tag) === cand.id) opt.selected = true;
          sel.appendChild(opt);
        }
        row.appendChild(sel);
      }

      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'tag-manage-btn';
      swap.dataset.action = 'swap';
      swap.dataset.tagId = tag.id;
      swap.title = '책↔단원 전환';
      swap.textContent = '⇄';
      row.appendChild(swap);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'tag-manage-btn';
      edit.dataset.action = 'rename';
      edit.dataset.tagId = tag.id;
      edit.textContent = '✎';
      row.appendChild(edit);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tag-manage-btn';
      del.dataset.action = 'delete';
      del.dataset.tagId = tag.id;
      del.textContent = '✕';
      row.appendChild(del);

      els.tagFilterBar.appendChild(row);
    }
  }
}

function renderTagPicker(container, category, selectedSet) {
  container.innerHTML = '';
  const items = category === 'unit'
    ? visibleUnitTree(selectedSet, expandedUnitIds)
    : orderedTagsInCategory(category).map(o => ({ ...o, hasChildren: false, expanded: false }));
  for (const { tag, depth, hasChildren, expanded } of items) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip tag-' + category + (selectedSet.has(tag.id) ? ' active' : '');
    chip.dataset.tagId = tag.id;
    if (depth) chip.style.marginLeft = (depth * 14) + 'px';

    if (hasChildren) {
      const arrow = document.createElement('span');
      arrow.className = 'tag-expand';
      arrow.textContent = expanded ? '▾' : '▸';
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedUnitIds.has(tag.id)) expandedUnitIds.delete(tag.id);
        else expandedUnitIds.add(tag.id);
        renderTagPicker(container, category, selectedSet);
      });
      chip.appendChild(arrow);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tag-chip-name';
    nameSpan.textContent = tag.name;
    chip.appendChild(nameSpan);

    chip.addEventListener('click', () => {
      if (selectedSet.has(tag.id)) selectedSet.delete(tag.id);
      else selectedSet.add(tag.id);
      renderTagPicker(container, category, selectedSet);
    });
    container.appendChild(chip);
  }

  const addChip = document.createElement('button');
  addChip.type = 'button';
  addChip.className = 'tag-chip tag-add';
  addChip.textContent = TAG_CATEGORY_META[category].addLabel;
  addChip.addEventListener('click', () => {
    const name = prompt(TAG_CATEGORY_META[category].addLabel.replace('＋ ', '') + ' 이름');
    if (name === null) return;
    const tag = addTag(name, category);
    if (tag) {
      selectedSet.add(tag.id);
      renderTagPicker(container, category, selectedSet);
    }
  });
  container.appendChild(addChip);
}

function renderNoteList(list) {
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
    li.className = 'note-item';
    const rateColor = rememberRateColor(n);
    if (rateColor) {
      li.style.borderLeftWidth = '5px';
      li.style.borderLeftColor = rateColor;
    }

    const header = document.createElement('div');
    header.className = 'note-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'note-title-wrap';
    const title = document.createElement('span');
    title.className = 'note-title';
    title.textContent = n.title;
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    const edit = document.createElement('button');
    edit.className = 'edit-btn';
    edit.title = '제목 수정';
    edit.textContent = '✎';
    edit.addEventListener('click', () => renameNote(n.id));
    header.appendChild(edit);

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => deleteNote(n.id));
    header.appendChild(del);

    li.appendChild(header);

    const meta = document.createElement('p');
    meta.className = 'note-meta';
    meta.textContent = `${formatLastReviewed(n.lastReviewedAt)} · `;
    const rateSpan = document.createElement('span');
    rateSpan.className = 'note-rate';
    rateSpan.textContent = formatRememberRate(n);
    if (rateColor) rateSpan.style.color = rateColor;
    meta.appendChild(rateSpan);
    li.appendChild(meta);

    const tagObjs = noteTagObjects(n);
    if (tagObjs.length && n.id !== editingNoteId) {
      const tagRow = document.createElement('div');
      tagRow.className = 'note-tag-row';
      for (const tag of tagObjs) {
        const chip = document.createElement('span');
        chip.className = 'note-tag tag-' + tag.category;
        chip.textContent = tag.name;
        tagRow.appendChild(chip);
      }
      li.appendChild(tagRow);
    }

    if (n.id === editingNoteId) {
      const textarea = document.createElement('textarea');
      textarea.className = 'note-edit-textarea';
      textarea.rows = 4;
      textarea.value = n.content;
      li.appendChild(textarea);

      const editTagIds = new Set(n.tagIds || []);
      const editTagPickers = document.createElement('div');
      editTagPickers.className = 'note-tag-pickers';
      for (const category of TAG_CATEGORIES) {
        const group = document.createElement('div');
        group.className = 'note-tag-group';
        const gLabel = document.createElement('span');
        gLabel.className = 'note-tag-group-label';
        gLabel.textContent = TAG_CATEGORY_META[category].label;
        group.appendChild(gLabel);
        const picker = document.createElement('div');
        picker.className = 'tag-picker';
        renderTagPicker(picker, category, editTagIds);
        group.appendChild(picker);
        editTagPickers.appendChild(group);
      }
      li.appendChild(editTagPickers);

      let editImage = n.image || null;
      const imageField = document.createElement('div');
      imageField.className = 'note-image-field';

      const imageLabel = document.createElement('label');
      imageLabel.className = 'note-image-btn';
      imageLabel.textContent = '📷 사진 변경';
      const imageInput = document.createElement('input');
      imageInput.type = 'file';
      imageInput.accept = 'image/*';
      imageInput.className = 'hidden';
      imageLabel.appendChild(imageInput);
      imageField.appendChild(imageLabel);

      const previewWrap = document.createElement('div');
      previewWrap.className = 'note-image-preview-wrap' + (editImage ? '' : ' hidden');
      const previewImg = document.createElement('img');
      previewImg.className = 'note-image-preview';
      previewImg.alt = '첨부 사진 미리보기';
      if (editImage) previewImg.src = editImage;
      const removeImgBtn = document.createElement('button');
      removeImgBtn.type = 'button';
      removeImgBtn.className = 'note-image-remove-btn';
      removeImgBtn.textContent = '✕';
      removeImgBtn.addEventListener('click', () => {
        editImage = null;
        previewImg.src = '';
        previewWrap.classList.add('hidden');
        imageInput.value = '';
      });
      previewWrap.appendChild(previewImg);
      previewWrap.appendChild(removeImgBtn);
      imageField.appendChild(previewWrap);

      imageInput.addEventListener('change', async () => {
        const file = imageInput.files[0];
        if (!file) return;
        try {
          editImage = await compressImageFile(file);
          previewImg.src = editImage;
          previewWrap.classList.remove('hidden');
        } catch {
          // ignore unreadable file
        }
      });

      li.appendChild(imageField);

      const actions = document.createElement('div');
      actions.className = 'note-edit-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'small-btn';
      saveBtn.textContent = '저장';
      saveBtn.addEventListener('click', () => {
        const trimmed = textarea.value.trim();
        if (!trimmed) return;
        n.content = trimmed;
        n.image = editImage;
        n.tagIds = Array.from(editTagIds);
        editingNoteId = null;
        persist();
      });
      actions.appendChild(saveBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'small-btn note-edit-cancel';
      cancelBtn.textContent = '취소';
      cancelBtn.addEventListener('click', () => {
        editingNoteId = null;
        renderNotes();
      });
      actions.appendChild(cancelBtn);

      li.appendChild(actions);
    } else {
      const body = document.createElement('p');
      body.className = 'note-content hidden';
      body.textContent = n.content;
      li.appendChild(body);

      let thumb = null;
      if (n.image) {
        thumb = document.createElement('img');
        thumb.className = 'note-thumb hidden';
        thumb.src = n.image;
        thumb.alt = '첨부 사진';
        thumb.addEventListener('click', (e) => {
          e.stopPropagation();
          thumb.classList.toggle('expanded');
        });
        li.appendChild(thumb);
      }

      titleWrap.addEventListener('click', () => {
        body.classList.toggle('hidden');
        if (thumb) thumb.classList.toggle('hidden');
      });

      const editContentBtn = document.createElement('button');
      editContentBtn.type = 'button';
      editContentBtn.className = 'note-edit-content-btn';
      editContentBtn.textContent = '✎ 내용 수정';
      editContentBtn.addEventListener('click', () => {
        editingNoteId = n.id;
        renderNotes();
      });
      li.appendChild(editContentBtn);
    }

    els.notesList.appendChild(li);
  }
}

function renderNotes() {
  renderTagFilterBar();
  renderTagPicker(els.bookTagPicker, 'book', pendingNoteTagIds);
  renderTagPicker(els.unitTagPicker, 'unit', pendingNoteTagIds);
  const list = sortNotes(visibleNotes());
  renderNoteList(list);
}

els.tagFilterBar.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  const action = actionEl ? actionEl.dataset.action : null;
  if (action === 'clear') {
    activeFilterTagIds.clear();
    renderNotes();
    return;
  }
  if (action === 'manage') {
    tagManageMode = !tagManageMode;
    renderTagFilterBar();
    return;
  }
  if (action === 'rename' || action === 'delete' || action === 'swap') {
    const tagId = actionEl.dataset.tagId;
    if (action === 'rename') renameTag(tagId);
    else if (action === 'delete') deleteTag(tagId);
    else toggleTagCategory(tagId);
    return;
  }
  if (action === 'expand') {
    const id = actionEl.closest('.tag-chip').dataset.tagId;
    if (expandedUnitIds.has(id)) expandedUnitIds.delete(id);
    else expandedUnitIds.add(id);
    renderTagFilterBar();
    return;
  }
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  const tagId = chip.dataset.tagId;
  if (activeFilterTagIds.has(tagId)) activeFilterTagIds.delete(tagId);
  else activeFilterTagIds.add(tagId);
  renderNotes();
});

els.tagFilterBar.addEventListener('change', (e) => {
  const sel = e.target.closest('.tag-parent-select');
  if (!sel) return;
  setUnitParent(sel.dataset.tagId, sel.value || null);
});

function clearPendingNoteImage() {
  pendingNoteImage = null;
  els.noteImageInput.value = '';
  els.noteImagePreviewWrap.classList.add('hidden');
  els.noteImagePreview.src = '';
}

els.noteImageInput.addEventListener('change', async () => {
  const file = els.noteImageInput.files[0];
  if (!file) return;
  try {
    pendingNoteImage = await compressImageFile(file);
    els.noteImagePreview.src = pendingNoteImage;
    els.noteImagePreviewWrap.classList.remove('hidden');
  } catch {
    clearPendingNoteImage();
  }
});

els.noteImageRemoveBtn.addEventListener('click', () => clearPendingNoteImage());

els.addNoteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = els.noteTitleInput.value.trim();
  const content = els.noteContentInput.value.trim();
  if (!title || !content) return;
  addNote(title, content, pendingNoteImage, Array.from(pendingNoteTagIds));
  els.noteTitleInput.value = '';
  els.noteContentInput.value = '';
  clearPendingNoteImage();
  pendingNoteTagIds.clear();
  els.noteTitleInput.focus();
});

els.noteSearchInput.addEventListener('input', () => {
  noteSearchQuery = els.noteSearchInput.value;
  renderNotes();
});

els.noteSortSelect.addEventListener('change', () => {
  noteSortMode = els.noteSortSelect.value;
  renderNotes();
});

els.notesTabBtn.addEventListener('click', () => switchTab('notes'));

function renderReviewTagCheckboxes() {
  els.reviewTagCheckboxes.innerHTML = '';
  if ((noteTags || []).length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-hint';
    p.textContent = '태그를 먼저 만들어 주세요.';
    els.reviewTagCheckboxes.appendChild(p);
    return;
  }
  for (const category of TAG_CATEGORIES) {
    const ordered = orderedTagsInCategory(category);
    if (ordered.length === 0) continue;

    const heading = document.createElement('p');
    heading.className = 'review-tag-heading';
    heading.textContent = TAG_CATEGORY_META[category].label;
    els.reviewTagCheckboxes.appendChild(heading);

    for (const { tag, depth } of ordered) {
      const label = document.createElement('label');
      label.className = 'review-unit-row';
      if (depth) label.style.paddingLeft = (depth * 18) + 'px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = tag.id;
      label.appendChild(cb);

      const span = document.createElement('span');
      span.textContent = `${tag.name} (${countNotesWithTag(tag.id)}개)`;
      label.appendChild(span);

      els.reviewTagCheckboxes.appendChild(label);
    }
  }
}

function showReviewCard() {
  const n = reviewQueue[reviewIndex];
  els.reviewProgress.textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;
  els.reviewCardTitle.textContent = n.title;
  els.reviewCardMeta.textContent = noteMeta(n);
  els.reviewCardContent.textContent = n.content;
  els.reviewCardContent.classList.add('hidden');
  if (n.image) {
    els.reviewCardImage.src = n.image;
    els.reviewCardImage.classList.add('hidden');
  } else {
    els.reviewCardImage.src = '';
    els.reviewCardImage.classList.add('hidden');
  }
  els.revealBtn.classList.remove('hidden');
  els.reviewGradeRow.classList.remove('hidden');
  els.reviewEndBtn.textContent = '종료';
}

function finishReview() {
  const total = reviewQueue.length;
  const rememberedCount = reviewSessionGrades.filter(Boolean).length;
  els.reviewProgress.textContent = '';
  els.reviewCardTitle.textContent = `이번 복습 결과: ${total}개 중 ${rememberedCount}개 기억함`;
  els.reviewCardMeta.textContent = '';
  els.reviewCardContent.classList.add('hidden');
  els.reviewCardImage.classList.add('hidden');
  els.reviewCardImage.src = '';
  els.revealBtn.classList.add('hidden');
  els.reviewGradeRow.classList.add('hidden');
  els.reviewEndBtn.textContent = '닫기';
}

function gradeCurrentCard(remembered) {
  const n = reviewQueue[reviewIndex];
  n.lastReviewedAt = Date.now();
  n.reviewCount = (n.reviewCount || 0) + 1;
  n.rememberedCount = (n.rememberedCount || 0) + (remembered ? 1 : 0);
  reviewSessionGrades[reviewIndex] = remembered;
  persist();

  if (reviewIndex >= reviewQueue.length - 1) {
    finishReview();
  } else {
    reviewIndex += 1;
    showReviewCard();
  }
}

// ---- 학습 분석 대시보드 ----
function isReviewedToday(n) {
  return n.lastReviewedAt && startOfDay(n.lastReviewedAt) === startOfDay(Date.now());
}

function tagStats(tag) {
  const ids = new Set(tagEffectiveIds(tag));
  const ns = notes.filter(n => (n.tagIds || []).some(t => ids.has(t)));
  const reviewCount = ns.reduce((s, n) => s + (n.reviewCount || 0), 0);
  const remembered = ns.reduce((s, n) => s + (n.rememberedCount || 0), 0);
  return { tag, noteCount: ns.length, reviewCount, rate: reviewCount ? remembered / reviewCount : null };
}

function rateColorFromValue(rate) {
  return `hsl(${Math.round(rate * 210)}, 70%, 45%)`;
}

function rateBadge(rate) {
  const span = document.createElement('span');
  span.className = 'analysis-rate';
  if (rate === null) {
    span.textContent = '미복습';
    span.style.color = 'var(--text-faint)';
  } else {
    span.textContent = Math.round(rate * 100) + '%';
    span.style.color = rateColorFromValue(rate);
  }
  return span;
}

function analysisSection(title) {
  const wrap = document.createElement('div');
  wrap.className = 'analysis-section';
  const h = document.createElement('p');
  h.className = 'analysis-heading';
  h.textContent = title;
  wrap.appendChild(h);
  return wrap;
}

function analysisBarRow(name, rate, meta, onClick) {
  const row = document.createElement(onClick ? 'button' : 'div');
  row.className = 'analysis-row' + (onClick ? ' clickable' : '');
  if (onClick) {
    row.type = 'button';
    row.addEventListener('click', onClick);
  }
  const top = document.createElement('div');
  top.className = 'analysis-row-top';
  const nm = document.createElement('span');
  nm.className = 'analysis-row-name';
  nm.textContent = name;
  top.appendChild(nm);
  top.appendChild(rateBadge(rate));
  row.appendChild(top);

  const track = document.createElement('div');
  track.className = 'analysis-bar-track';
  const fill = document.createElement('div');
  fill.className = 'analysis-bar-fill';
  fill.style.width = (rate === null ? 0 : Math.round(rate * 100)) + '%';
  if (rate !== null) fill.style.background = rateColorFromValue(rate);
  track.appendChild(fill);
  row.appendChild(track);

  if (meta) {
    const m = document.createElement('div');
    m.className = 'analysis-row-meta';
    m.textContent = meta;
    row.appendChild(m);
  }
  return row;
}

function analysisNoteRow(n, rate, extraMeta) {
  const row = document.createElement('div');
  row.className = 'analysis-note-row';
  const top = document.createElement('div');
  top.className = 'analysis-row-top';
  const nm = document.createElement('span');
  nm.className = 'analysis-row-name';
  nm.textContent = n.title;
  top.appendChild(nm);
  top.appendChild(rateBadge(rate));
  row.appendChild(top);

  const parts = [];
  const tags = noteTagObjects(n).map(t => t.name);
  if (tags.length) parts.push(tags.join(' · '));
  if (extraMeta) parts.push(extraMeta);
  if (parts.length) {
    const sub = document.createElement('div');
    sub.className = 'analysis-row-meta';
    sub.textContent = parts.join('  ·  ');
    row.appendChild(sub);
  }
  return row;
}

function renderAnalysis() {
  const panel = els.analysisPanel;
  panel.innerHTML = '';

  if (notes.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-hint';
    p.textContent = '아직 오답노트가 없어요. 노트를 추가하면 분석이 표시돼요.';
    panel.appendChild(p);
    return;
  }

  const totalReviews = notes.reduce((s, n) => s + (n.reviewCount || 0), 0);
  const totalRemembered = notes.reduce((s, n) => s + (n.rememberedCount || 0), 0);
  const reviewedNotes = notes.filter(n => (n.reviewCount || 0) > 0).length;
  const neverReviewed = notes.length - reviewedNotes;
  const todayCount = notes.filter(isReviewedToday).length;
  const overallRate = totalReviews ? totalRemembered / totalReviews : null;

  // 요약 타일
  const tiles = document.createElement('div');
  tiles.className = 'analysis-tiles';
  const tile = (label, value, color) => {
    const t = document.createElement('div');
    t.className = 'analysis-tile';
    const v = document.createElement('div');
    v.className = 'analysis-tile-value';
    v.textContent = value;
    if (color) v.style.color = color;
    const l = document.createElement('div');
    l.className = 'analysis-tile-label';
    l.textContent = label;
    t.appendChild(v);
    t.appendChild(l);
    return t;
  };
  tiles.appendChild(tile('총 노트', String(notes.length)));
  tiles.appendChild(tile('전체 기억률', overallRate === null ? '-' : Math.round(overallRate * 100) + '%',
    overallRate === null ? null : rateColorFromValue(overallRate)));
  tiles.appendChild(tile('미복습', String(neverReviewed)));
  tiles.appendChild(tile('오늘 복습', String(todayCount)));
  panel.appendChild(tiles);

  const unitStats = tagsInCategory('unit').map(tagStats)
    .filter(s => s.reviewCount > 0)
    .sort((a, b) => a.rate - b.rate);

  // 추천 + 바로 복습
  const rec = document.createElement('div');
  rec.className = 'analysis-rec';
  const recText = document.createElement('p');
  recText.className = 'analysis-rec-text';
  if (unitStats.length) {
    const w = unitStats[0];
    recText.textContent = `가장 취약한 단원은 "${w.tag.name}" (기억률 ${Math.round(w.rate * 100)}%)예요. 여기부터 복습해요.`;
  } else if (neverReviewed > 0) {
    recText.textContent = '아직 복습 데이터가 적어요. 복습을 시작하면 취약점 분석이 정확해져요.';
  } else {
    recText.textContent = '잘하고 있어요! 오래된 노트 위주로 복습해요.';
  }
  rec.appendChild(recText);
  const recBtn = document.createElement('button');
  recBtn.type = 'button';
  recBtn.className = 'small-btn';
  recBtn.textContent = '🎯 지금 복습 시작';
  recBtn.addEventListener('click', () => {
    let pool;
    if (unitStats.length) {
      const ids = new Set(tagEffectiveIds(unitStats[0].tag));
      pool = notes.filter(n => (n.tagIds || []).some(t => ids.has(t)));
    } else {
      pool = notes.slice();
    }
    if (pool.length === 0) pool = notes.slice();
    beginReview(pool, Math.min(pool.length, 10));
  });
  rec.appendChild(recBtn);
  panel.appendChild(rec);

  // 취약 단원
  const weakSec = analysisSection('🎯 취약 단원');
  if (unitStats.length === 0) {
    const p = document.createElement('p');
    p.className = 'analysis-empty';
    p.textContent = '복습 기록이 쌓이면 여기 표시돼요.';
    weakSec.appendChild(p);
  } else {
    for (const s of unitStats.slice(0, 5)) {
      weakSec.appendChild(analysisBarRow(s.tag.name, s.rate, `${s.noteCount}개 · ${s.reviewCount}회 복습`, () => {
        activeFilterTagIds.clear();
        activeFilterTagIds.add(s.tag.id);
        els.analysisPanel.classList.add('hidden');
        renderNotes();
        els.tagFilterBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    }
  }
  panel.appendChild(weakSec);

  // 자주 틀리는 개념
  const forgotten = notes.filter(n => (n.reviewCount || 0) >= 2)
    .map(n => ({ n, rate: n.rememberedCount / n.reviewCount }))
    .sort((a, b) => a.rate - b.rate || b.n.reviewCount - a.n.reviewCount)
    .slice(0, 5);
  const forgSec = analysisSection('🔁 자주 틀리는 개념');
  if (forgotten.length === 0) {
    const p = document.createElement('p');
    p.className = 'analysis-empty';
    p.textContent = '2번 이상 복습한 노트가 쌓이면 표시돼요.';
    forgSec.appendChild(p);
  } else {
    for (const f of forgotten) forgSec.appendChild(analysisNoteRow(f.n, f.rate));
  }
  panel.appendChild(forgSec);

  // 복습이 필요한 노트
  const stale = notes.filter(n => !isReviewedToday(n))
    .slice()
    .sort((a, b) => reviewPriority(b) - reviewPriority(a))
    .slice(0, 5);
  const staleSec = analysisSection('⏰ 복습이 필요한 노트');
  if (neverReviewed > 0) {
    const info = document.createElement('p');
    info.className = 'analysis-sub';
    info.textContent = `한 번도 복습 안 한 노트 ${neverReviewed}개`;
    staleSec.appendChild(info);
  }
  for (const n of stale) {
    staleSec.appendChild(analysisNoteRow(
      n,
      n.reviewCount ? n.rememberedCount / n.reviewCount : null,
      formatLastReviewed(n.lastReviewedAt)
    ));
  }
  panel.appendChild(staleSec);
}

function beginReview(pool, count) {
  reviewQueue = weightedSample(pool, count);
  reviewSessionGrades = [];
  reviewIndex = 0;
  els.analysisPanel.classList.add('hidden');
  els.reviewSetupPanel.classList.add('hidden');
  els.reviewPlayPanel.classList.remove('hidden');
  showReviewCard();
}

els.reviewBtn.addEventListener('click', () => {
  els.reviewPlayPanel.classList.add('hidden');
  els.analysisPanel.classList.add('hidden');
  const opening = els.reviewSetupPanel.classList.contains('hidden');
  els.reviewSetupPanel.classList.toggle('hidden');
  if (opening) {
    els.reviewSetupHint.textContent = '';
    renderReviewTagCheckboxes();
  }
});

els.startReviewBtn.addEventListener('click', () => {
  const selectedIds = Array.from(els.reviewTagCheckboxes.querySelectorAll('input:checked')).map(cb => cb.value);
  const idSet = new Set();
  for (const id of selectedIds) {
    const tag = findTag(id);
    if (tag) for (const eid of tagEffectiveIds(tag)) idSet.add(eid);
    else idSet.add(id);
  }
  const pool = selectedIds.length === 0
    ? notes.slice()
    : notes.filter(n => (n.tagIds || []).some(tid => idSet.has(tid)));
  if (pool.length === 0) {
    els.reviewSetupHint.textContent = idSet.size === 0
      ? '복습할 노트가 없어요.'
      : '선택한 태그의 노트가 없어요.';
    return;
  }
  const count = Math.max(1, Math.min(pool.length, Math.floor(Number(els.reviewCountInput.value)) || 1));
  beginReview(pool, count);
});

els.analysisBtn.addEventListener('click', () => {
  els.reviewPlayPanel.classList.add('hidden');
  els.reviewSetupPanel.classList.add('hidden');
  const opening = els.analysisPanel.classList.contains('hidden');
  els.analysisPanel.classList.toggle('hidden');
  if (opening) renderAnalysis();
});

els.revealBtn.addEventListener('click', () => {
  els.reviewCardContent.classList.toggle('hidden');
  if (els.reviewCardImage.src) els.reviewCardImage.classList.toggle('hidden');
});

els.gradeForgotBtn.addEventListener('click', () => gradeCurrentCard(false));
els.gradeRememberedBtn.addEventListener('click', () => gradeCurrentCard(true));

els.reviewEndBtn.addEventListener('click', () => {
  els.reviewPlayPanel.classList.add('hidden');
  reviewQueue = [];
  reviewSessionGrades = [];
});

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
      noteTags = Array.isArray(snap.data().noteTags) ? snap.data().noteTags : null;
      if (noteTags === null) migrateFoldersToTags();
      resetIfNeeded(tasks);
      render();
      renderCalendar();
      renderNotes();
      saveLocal();
    } else {
      await fsMod.setDoc(docRef, { items: tasks, history, noteUnits, noteTags: noteTags || [], notes, updatedAt: Date.now() });
    }
  } else {
    const snap = await fsMod.getDoc(docRef);
    if (!snap.exists()) {
      await fsMod.setDoc(docRef, { items: tasks, history, noteUnits, noteTags: noteTags || [], notes, updatedAt: Date.now() });
    } else {
      tasks = snap.data().items || [];
      history = snap.data().history || {};
      noteUnits = snap.data().noteUnits || [];
      notes = snap.data().notes || [];
      noteTags = Array.isArray(snap.data().noteTags) ? snap.data().noteTags : null;
      if (noteTags === null) migrateFoldersToTags();
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
    noteTags = Array.isArray(snap.data().noteTags) ? snap.data().noteTags : null;
    if (noteTags === null) migrateFoldersToTags();
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
