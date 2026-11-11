// ===== Хранилище: localStorage. Позже заменим на запросы к Flask API. =====
const DB = {
  load() {
    try { return JSON.parse(localStorage.getItem('streakly')) || { users: {}, session: null }; }
    catch { return { users: {}, session: null }; }
  },
  save(d) { localStorage.setItem('streakly', JSON.stringify(d)); },
};

// ===== Даты =====
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.round((a - b) / 864e5);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

// ===== Аккаунты (демо: пароль кодируется, а не хэшируется. В бэкенде будет настоящий хэш) =====
const enc = p => btoa(encodeURIComponent(p));

function register(name, pass) {
  const d = DB.load();
  if (name.length < 3) return 'Имя: минимум 3 символа';
  if (pass.length < 6) return 'Пароль: минимум 6 символов';
  if (Object.hasOwn(d.users, name)) return 'Это имя уже занято';
  d.users[name] = { pass: enc(pass), course: null, start: null, reports: {} };
  d.session = name;
  DB.save(d);
}

function login(name, pass) {
  const d = DB.load();
  if (!Object.hasOwn(d.users, name) || d.users[name].pass !== enc(pass)) return 'Неверное имя или пароль';
  d.session = name;
  DB.save(d);
}

function bindAuth(formId, action, next) {
  $(formId).onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    const err = action(f.username.value.trim(), f.password.value);
    if (err) $('err').textContent = err; else location.href = next;
  };
}

function chooseCourse(id) {
  const d = DB.load(), u = d.users[d.session];
  if (u.course === id) return true;
  if (u.course && !confirm('Сменить курс? Прогресс текущего курса будет сброшен.')) return false;
  Object.assign(u, { course: id, start: iso(today()), reports: {} });
  DB.save(d);
  return true;
}

// ===== Статистика =====
// Доля выполнения нормы за день: 0..1, null если день вне курса
function dayPct(u, date) {
  const c = COURSES.find(x => x.id === u.course);
  if (!c) return null;
  const day = diffDays(date, parse(u.start)) + 1;
  if (day < 1 || day > c.days) return null;
  const n = norm(c, day), rep = u.reports[iso(date)];
  return rep ? rep.reduce((a, b) => a + b, 0) / (n.sets * n.reps) : 0;
}

// Средний процент за период. Сегодняшний день без отчёта не считается пропуском.
function avgPct(u, from, to) {
  let sum = 0, k = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    if (iso(d) === iso(today()) && !u.reports[iso(d)]) continue;
    const p = dayPct(u, d);
    if (p !== null) { sum += p; k++; }
  }
  return k ? Math.round(100 * sum / k) : null;
}

function streak(u) {
  let d = today(), n = 0;
  if (!(dayPct(u, d) >= 1)) d = addDays(d, -1);
  while (dayPct(u, d) >= 1) { n++; d = addDays(d, -1); }
  return n;
}

function monthScore(u) {
  const t = today();
  return u.course ? avgPct(u, new Date(t.getFullYear(), t.getMonth(), 1), t) : null;
}

// ===== Интерфейс =====
function renderNav() {
  const d = DB.load();
  $('nav').innerHTML = d.session
    ? `<span class="who">${esc(d.session)}</span><a href="#" id="logout">Выйти</a>`
    : '<a href="login.html">Войти</a><a class="btn" href="register.html">Начать курс</a>';
  if ($('logout')) $('logout').onclick = e => {
    e.preventDefault(); d.session = null; DB.save(d); location.href = 'index.html';
  };
}

// Мозаика из кубиков на главной: цифра в строке задаёт оттенок кубика (g0..g5)
function renderMosaic() {
  const pattern = '203142053120413025314203241530';
  const raised = [3, 8, 14, 19, 26];
  $('mosaic').innerHTML = [...pattern].map((s, i) =>
    `<i class="g${s}${raised.includes(i) ? ' up' : ''}" style="--d:${i % 6 + Math.floor(i / 6)}"></i>`).join('');
}

function renderCourses(level = 'Все') {
  const d = DB.load(), u = d.session && d.users[d.session];
  $('filters').innerHTML = LEVELS.map(l =>
    `<button class="chip${l === level ? ' on' : ''}" data-level="${l}">${l}</button>`).join('');
  $('filters').onclick = e => { if (e.target.dataset.level) renderCourses(e.target.dataset.level); };
  $('courseList').innerHTML = COURSES.filter(c => level === 'Все' || c.level === level).map(c => `
    <article class="course">
      <span class="tag">${c.level}</span>
      <h3>${c.title}</h3><p>${c.desc}</p>
      <p class="meta">${c.days} дн., подходов: ${c.sets}</p>
      <button class="btn ${u && u.course === c.id ? '' : 'btn-ghost'}" data-id="${c.id}">${u && u.course === c.id ? 'Ваш курс' : 'Выбрать'}</button>
    </article>`).join('');
  $('courseList').onclick = e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (!DB.load().session) { location.href = 'register.html'; return; }
    if (chooseCourse(id)) location.href = 'dashboard.html';
  };
}

function renderToday(u) {
  const c = COURSES.find(x => x.id === u.course), box = $('today');
  if (!c) {
    box.innerHTML = '<h2>Курс не выбран</h2><p class="sub">Выберите курс, чтобы увидеть норму на сегодня.</p><a class="btn" href="index.html#courses">Выбрать курс</a>';
    return;
  }
  const day = diffDays(today(), parse(u.start)) + 1;
  if (day > c.days) {
    box.innerHTML = `<h2>${c.title}</h2><p class="sub">Курс пройден. Отличная работа!</p><a class="btn" href="index.html#courses">Выбрать новый курс</a>`;
    return;
  }
  const n = norm(c, day), saved = u.reports[iso(today())] || [];
  box.innerHTML = `
    <h2>${c.title}</h2><p class="sub">День ${day} из ${c.days}. Норма на сегодня</p>
    <div class="big">${n.sets}×${n.reps}<small>подходов (${c.unit || 'раз'})</small></div>
    <p class="sub">${saved.length ? 'Сегодня выполнено: ' + Math.round(100 * saved.reduce((x, y) => x + y, 0) / (n.sets * n.reps)) + '% нормы' : 'Отчёт за сегодня ещё не сохранён'}</p>
    <form id="reportForm">
      ${Array.from({ length: n.sets }, (_, i) => `
        <label for="s${i}">Подход ${i + 1}</label>
        <input id="s${i}" type="number" min="0" max="999" placeholder="${n.reps}" value="${saved[i] ?? ''}">`).join('')}
      <button class="btn" type="submit">Сохранить отчёт</button>
      <p class="ok-msg" id="msg" role="status"></p>
    </form>`;
  $('reportForm').onsubmit = e => {
    e.preventDefault();
    const d = DB.load();
    d.users[d.session].reports[iso(today())] =
      Array.from({ length: n.sets }, (_, i) => Math.max(0, Math.min(999, parseInt($('s' + i).value) || 0)));
    DB.save(d);
    renderDashboard();
    $('msg').textContent = 'Отчёт сохранён';
  };
}

function renderWeek(u) {
  const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const monday = addDays(today(), -((today().getDay() + 6) % 7));
  $('week').innerHTML = names.map((nm, i) => {
    const date = addDays(monday, i), isToday = iso(date) === iso(today());
    const p = date > today() || (isToday && !u.reports[iso(date)]) ? null : dayPct(u, date);
    const cls = p > 1 ? 'ov' : p === 1 ? 'ok' : p > 0 ? 'pt' : 'ms', w = p === null ? 0 : Math.max(4, Math.min(100, p * 100));
    return `<div class="row"><i${isToday ? ' class="now"' : ''}>${nm}</i>
      <span class="bar"><b class="${cls}" style="width:${w}%"></b></span>
      <span class="pc">${p === null ? '–' : Math.round(p * 100) + '%'}</span></div>`;
  }).join('');
  const wp = u.course ? avgPct(u, monday, today()) : null;
  $('weekSub').textContent = wp === null ? 'Пока нет данных' : `${wp}% нормы выполнено`;
}

function renderStats(u) {
  const t = today(), monthPct = u.course ? avgPct(u, new Date(t.getFullYear(), t.getMonth(), 1), t) : null;
  const weekPct = u.course ? avgPct(u, addDays(t, -((t.getDay() + 6) % 7)), t) : null;
  const total = Object.values(u.reports).flat().reduce((a, b) => a + b, 0);
  const tile = (v, l) => `<div class="tile"><strong>${v}</strong>${l}</div>`;
  $('stats').innerHTML =
    tile(u.course ? streak(u) : 0, 'дней подряд') + tile(weekPct === null ? '–' : weekPct + '%', 'за неделю') +
    tile(monthPct === null ? '–' : monthPct + '%', 'за месяц') + tile(total, 'всего выполнено');
}

function renderSide() {
  const items = [['home', 'index.html', 'Курсы'], ['dashboard', 'dashboard.html', 'Мои курсы'],
    ['leaderboard', 'leaderboard.html', 'Лидерборд'], ['about', 'about.html', 'О сайте']];
  const side = $('side');
  side.innerHTML = `
    <nav class="panel" id="panel" aria-label="Разделы сайта"><h2>Разделы</h2>${items.map(([k, h, t]) =>
      `<a href="${h}"${k === page ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
    <button class="ribbon" id="ribbon" aria-controls="panel" aria-expanded="false"><span>Разделы</span></button>`;
  const btn = $('ribbon');
  const set = open => {
    side.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
    btn.firstChild.textContent = open ? 'Закрыть' : 'Разделы';
    $('panel').inert = !open;  // закрытая панель не попадает в фокус с клавиатуры
  };
  set(false);
  btn.onclick = () => set(!side.classList.contains('open'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  document.addEventListener('click', e => { if (!side.contains(e.target)) set(false); });
}

// Человечек для пьедестала (победитель поднимает руки)
function figure(winner) {
  const arms = winner ? 'M10 26 L3 10 M30 26 L37 10' : 'M10 26 L5 44 M30 26 L35 44';
  return `<svg class="man" viewBox="0 0 40 70" aria-hidden="true"><rect x="12" y="2" width="16" height="16" rx="2"/>
    <rect x="10" y="22" width="20" height="26" rx="2"/><rect x="11" y="50" width="8" height="19" rx="1"/><rect x="21" y="50" width="8" height="19" rx="1"/>
    <path d="${arms}" fill="none" stroke-width="5"/></svg>`;
}

function renderBoard() {
  const d = DB.load(), u = d.session && d.users[d.session];
  const list = [{ n: 'Алина', p: 104 }, { n: 'Максим', p: 88 }, { n: 'Дмитрий', p: 81 }, { n: 'Ольга', p: 72 }, { n: 'Иван', p: 65 }];
  if (u) list.push({ n: d.session, p: (u.course && monthScore(u)) || 0, me: true });
  list.sort((x, y) => y.p - x.p);
  const places = [2, 1, 3];  // на пьедестале слева направо: 2-е, 1-е, 3-е место
  $('podium').innerHTML = [list[1], list[0], list[2]].map((r, i) => `
    <div class="pl p${places[i]}${r.me ? ' me' : ''}">
      ${figure(places[i] === 1)}
      <span class="nm">${esc(r.n)}${r.me ? ' (вы)' : ''}</span><b>${r.p}%</b>
      <div class="step">${places[i]}</div>
    </div>`).join('');
  $('board').innerHTML = list.slice(3).map((r, i) =>
    `<li class="${r.me ? 'me' : ''}"><span><em>${i + 4}</em>${esc(r.n)}${r.me ? ' (вы)' : ''}</span><b>${r.p}%</b></li>`).join('');
}

function renderDashboard() {
  const d = DB.load();
  if (!d.session) { location.href = 'login.html'; return; }
  const u = d.users[d.session];
  $('hi').textContent = `Привет, ${d.session}!`;
  renderToday(u); renderWeek(u); renderStats(u);
}

// Фон из кубиков: по диагонали проходит неоновая фиолетовая волна
function initWave() {
  const cv = document.createElement('canvas');
  cv.className = 'bgwave';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d'), S = 44, G = 4;  // размер кубика и зазор
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h;
  const fit = () => {
    const dpr = devicePixelRatio || 1;
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = now => {
    const cols = Math.ceil(w / S), rows = Math.ceil(h / S), span = cols + rows + 24;
    const front = still ? span / 3 - 12 : ((now / 1000) * 9) % span - 12;  // положение гребня волны
    ctx.clearRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = 20 + ((((c * 73856093) ^ (r * 19349663)) >>> 0) % 7);
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
      ctx.fillRect(c * S, r * S, S - G, S - G);
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(c * S, r * S, S - G, 2);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const dist = c + r - front;
      if (Math.abs(dist) > 9) continue;
      const k = Math.exp(-((dist / 3.5) ** 2));  // 1 на гребне, быстро спадает в стороны
      if (k > 0.3) { ctx.fillStyle = `rgba(176,77,255,${k * 0.14})`; ctx.fillRect(c * S - 3, r * S - 3, S - G + 6, S - G + 6); }
      ctx.fillStyle = `rgba(176,77,255,${k * 0.6})`;
      ctx.fillRect(c * S, r * S, S - G, S - G);
    }
    if (!still) requestAnimationFrame(draw);
  };
  fit();
  addEventListener('resize', () => { fit(); if (still) draw(0); });
  requestAnimationFrame(draw);
}

// ===== Запуск =====
const page = document.body.dataset.page;
initWave();
renderNav();
if ($('side')) renderSide();
if (page === 'home') { renderCourses(); renderMosaic(); }
if (page === 'login') bindAuth('loginForm', login, 'dashboard.html');
if (page === 'register') bindAuth('registerForm', register, 'index.html#courses');
if (page === 'dashboard') renderDashboard();
if (page === 'leaderboard') renderBoard();
