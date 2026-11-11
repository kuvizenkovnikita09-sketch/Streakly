// ===== Хранилище: localStorage. Позже заменим на запросы к Flask API. =====
const DB = {
  load() {
    let d;
    try { d = JSON.parse(localStorage.getItem('streakly')); } catch { d = null; }
    d = d || { users: {}, session: null };
    for (const u of Object.values(d.users)) {  // перенос из старого формата (один курс)
      if (!u.enrolls) {
        u.enrolls = {};
        if (u.course) u.enrolls[u.course] = { course: u.course, start: u.start, reports: u.reports || {} };
      }
    }
    return d;
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
  d.users[name] = { pass: enc(pass), enrolls: {} };
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

// Курс можно выбрать только один раз: повторно тот же курс не добавится
function chooseCourse(id) {
  const d = DB.load(), u = d.users[d.session];
  if (!Object.hasOwn(u.enrolls, id)) {
    u.enrolls[id] = { course: id, start: iso(today()), reports: {} };
    DB.save(d);
  }
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
// Курсы пользователя и вспомогательные функции
const enrolls = u => Object.values(u.enrolls);
const courseOf = e => COURSES.find(x => x.id === e.course);
// Статус дня: ov (сверх нормы), ok (норма), pt (частично), ms (не выполнено)
const status = p => p > 1.0001 ? 'ov' : p >= 0.9999 ? 'ok' : p > 0 ? 'pt' : 'ms';

// Сумма процентов и число дней по одному курсу. Сегодня без отчёта пропуском не считается.
function sumPct(e, from, to) {
  let sum = 0, k = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    if (iso(d) === iso(today()) && !e.reports[iso(d)]) continue;
    const p = dayPct(e, d);
    if (p !== null) { sum += p; k++; }
  }
  return [sum, k];
}

// Средний процент по всем курсам за период
function avgPct(e, from, to) {  // средний процент по одному курсу за период
  const [s, k] = sumPct(e, from, to);
  return k ? Math.round(100 * s / k) : null;
}

// Средний процент за один день по всем активным в этот день курсам

// Серия по курсу: дни подряд, когда норма выполнена
function streak(e) {
  let d = today(), n = 0;
  if (!(dayPct(e, d) >= 1)) d = addDays(d, -1);
  while (dayPct(e, d) >= 1) { n++; d = addDays(d, -1); }
  return n;
}

function monthScore(e) {
  const t = today();
  return avgPct(e, new Date(t.getFullYear(), t.getMonth(), 1), t);
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
  const has = id => u && Object.hasOwn(u.enrolls, id);
  $('filters').innerHTML = LEVELS.map(l =>
    `<button class="chip${l === level ? ' on' : ''}" data-level="${l}">${l}</button>`).join('');
  $('filters').onclick = e => { if (e.target.dataset.level) renderCourses(e.target.dataset.level); };
  $('courseList').innerHTML = COURSES.filter(c => level === 'Все' || c.level === level).map(c => `
    <article class="course">
      <span class="tag">${c.level}</span>
      <h3>${c.title}</h3><p>${c.desc}</p>
      <p class="meta">${c.days} дн., подходов: ${c.sets}</p>
      <button class="btn ${has(c.id) ? '' : 'btn-ghost'}" data-id="${c.id}">${has(c.id) ? 'Выбран' : 'Выбрать'}</button>
    </article>`).join('');
  $('courseList').onclick = e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (!DB.load().session) { location.href = 'register.html'; return; }
    chooseCourse(id);
    location.href = 'dashboard.html';
  };
}

function renderToday(u) {
  const list = enrolls(u), box = $('today');
  if (!list.length) {
    box.innerHTML = '<section class="card"><h2>Курсы не выбраны</h2><p class="sub">Выберите один или несколько курсов, чтобы увидеть норму на сегодня.</p><a class="btn" href="index.html#courses">Выбрать курс</a></section>';
    return;
  }
  box.innerHTML = list.map(e => {
    const c = courseOf(e), id = e.course, day = diffDays(today(), parse(e.start)) + 1;
    const leave = `<button class="btn btn-ghost small" data-leave="${id}">Покинуть курс</button>`;
    if (day > c.days) return `<section class="card"><h2>${c.title}</h2><p class="sub">Курс пройден. Отличная работа!</p>${leave}</section>`;
    const n = norm(c, day), saved = e.reports[iso(today())] || [];
    return `<section class="card">
      <h2>${c.title}</h2><p class="sub">День ${day} из ${c.days}. Норма на сегодня</p>
      <div class="big">${n.sets}×${n.reps}<small>подходов (${c.unit || 'раз'})</small></div>
      <p class="sub">${saved.length ? 'Сегодня выполнено: ' + Math.round(100 * saved.reduce((x, y) => x + y, 0) / (n.sets * n.reps)) + '% нормы' : 'Отчёт за сегодня ещё не сохранён'}</p>
      <form class="rf" id="rf_${id}">
        ${Array.from({ length: n.sets }, (_, i) => `
          <label for="s_${id}_${i}">Подход ${i + 1}</label>
          <input id="s_${id}_${i}" type="number" min="0" max="999" placeholder="${n.reps}" value="${saved[i] ?? ''}">`).join('')}
        <button class="btn" type="submit">Сохранить отчёт</button>
        <p class="ok-msg" id="msg_${id}" role="status"></p>
      </form>${leave}</section>`;
  }).join('');
  box.onclick = ev => {
    const id = ev.target.dataset.leave;
    if (!id || !confirm('Покинуть курс? Прогресс по нему будет удалён.')) return;
    const d = DB.load();
    delete d.users[d.session].enrolls[id];
    DB.save(d);
    renderDashboard();
  };
  list.forEach(e => {
    const f = $('rf_' + e.course);
    if (!f) return;
    f.onsubmit = ev => {
      ev.preventDefault();
      const id = e.course, n = norm(courseOf(e), diffDays(today(), parse(e.start)) + 1);
      const d = DB.load();
      d.users[d.session].enrolls[id].reports[iso(today())] =
        Array.from({ length: n.sets }, (_, i) => Math.max(0, Math.min(999, parseInt($(`s_${id}_${i}`).value) || 0)));
      DB.save(d);
      renderDashboard();
      $('msg_' + id).textContent = 'Отчёт сохранён';
    };
  });
}

function weekRows(e) {  // полосы выполнения по дням текущей недели для одного курса
  const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const monday = addDays(today(), -((today().getDay() + 6) % 7));
  return names.map((nm, i) => {
    const date = addDays(monday, i), isToday = iso(date) === iso(today());
    const p = date > today() || (isToday && !e.reports[iso(date)]) ? null : dayPct(e, date);
    const w = p === null ? 0 : Math.max(4, Math.min(100, p * 100));
    return `<div class="row"><i${isToday ? ' class="now"' : ''}>${nm}</i>
      <span class="bar"><b class="${status(p)}" style="width:${w}%"></b></span>
      <span class="pc">${p === null ? '–' : Math.round(p * 100) + '%'}</span></div>`;
  }).join('');
}

const tile = (v, l) => `<div class="tile"><strong>${v}</strong>${l}</div>`;

function renderCourseStats(u) {  // отдельная карточка статистики для каждого курса
  const t = today(), monday = addDays(t, -((t.getDay() + 6) % 7));
  $('perCourse').innerHTML = enrolls(u).map(e => {
    const wp = avgPct(e, monday, t), mp = monthScore(e);
    const total = Object.values(e.reports).flat().reduce((x, y) => x + y, 0);
    return `<section class="card">
      <h2>${courseOf(e).title}</h2>
      <p class="sub">${wp === null ? 'Пока нет данных за неделю' : wp + '% нормы за неделю'}</p>
      <div>${weekRows(e)}</div>
      <div class="tiles">${tile(streak(e), 'дней подряд') + tile(wp === null ? '–' : wp + '%', 'за неделю') +
        tile(mp === null ? '–' : mp + '%', 'за месяц') + tile(total, 'всего выполнено')}</div>
    </section>`;
  }).join('');
}

function renderSide() {
  const items = [['home', 'index.html', 'Курсы'], ['dashboard', 'dashboard.html', 'Мои курсы'],
    ['stats', 'stats.html', 'Моя статистика'], ['leaderboard', 'leaderboard.html', 'Лидерборд'], ['about', 'about.html', 'О сайте']];
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

// Демо-участники: у каждого курса свои значения (одинаковые при каждом заходе)
function demoPct(cid, name) {
  let h = 0;
  for (const ch of cid + name) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return 62 + h % 48;
}

const boardView = { cid: null };

function renderBoard() {
  const d = DB.load(), u = d.session && d.users[d.session];
  if (!boardView.cid) boardView.cid = (u && Object.keys(u.enrolls)[0]) || COURSES[0].id;
  const c = COURSES.find(x => x.id === boardView.cid);
  const joined = u && Object.hasOwn(u.enrolls, c.id);
  $('boardTitle').textContent = 'Рейтинг месяца: ' + c.title;
  $('boardSub').textContent = 'Средний процент выполнения нормы по этому курсу с начала месяца. Выше 100% можно получить, если делать больше нормы.' +
    (u && !joined ? ' Выберите этот курс, чтобы попасть в рейтинг.' : '');
  $('boardFilters').innerHTML = COURSES.map(x =>
    `<button class="chip${x.id === c.id ? ' on' : ''}" data-board="${x.id}">${esc(x.title)}</button>`).join('');
  const list = ['Алина', 'Максим', 'Дмитрий', 'Ольга', 'Иван'].map(n => ({ n, p: demoPct(c.id, n) }));
  if (joined) list.push({ n: d.session, p: monthScore(u.enrolls[c.id]) || 0, me: true });
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
  renderToday(u); renderCourseStats(u);
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

// ===== Моя статистика: календарь по месяцам =====
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const view = { month: null, cid: null };  // какой месяц и курс показаны

function renderStatsPage() {
  const d = DB.load();
  if (!d.session) { location.href = 'login.html'; return; }
  const u = d.users[d.session], list = enrolls(u);
  if (!view.month) { const t = today(); view.month = new Date(t.getFullYear(), t.getMonth(), 1); }
  if (!u.enrolls[view.cid]) view.cid = Object.keys(u.enrolls)[0];
  const m = view.month, y = m.getFullYear(), mo = m.getMonth();
  $('monthTitle').textContent = `${MONTHS[mo]} ${y}`;
  $('statsFilters').innerHTML = list.map(e => [e.course, courseOf(e).title]).map(([id, t]) =>
    `<button class="chip${id === view.cid ? ' on' : ''}" data-cid="${id}">${esc(t)}</button>`).join('');
  if (!list.length) {
    $('calendar').innerHTML = '<p class="sub">Пока нет курсов. Выберите курс в разделе «Курсы».</p>';
    $('monthStats').innerHTML = ''; $('monthSub').textContent = '';
    return;
  }
  const pick = [u.enrolls[view.cid]];
  const pct = date => {
    const l = pick.map(e => dayPct(e, date)).filter(p => p !== null);
    return l.length ? l.reduce((x, y) => x + y, 0) / l.length : null;
  };
  const cnt = { ov: 0, ok: 0, pt: 0, ms: 0 };
  let sum = 0, k = 0;
  let html = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(n => `<b class="dow">${n}</b>`).join('') + '<i></i>'.repeat((m.getDay() + 6) % 7);
  for (let n = 1, last = new Date(y, mo + 1, 0).getDate(); n <= last; n++) {
    const date = new Date(y, mo, n), isToday = iso(date) === iso(today());
    let p = pct(date), cls = '';
    // цвет получают только прошедшие дни курса (и сегодня, если есть отчёт)
    if (p !== null && date <= today() && !(isToday && !pick.some(e => e.reports[iso(date)]))) {
      cls = status(p); cnt[cls]++; sum += p; k++;
    } else p = null;
    const label = `${String(n).padStart(2, '0')}.${String(mo + 1).padStart(2, '0')}` + (p === null ? '' : `: ${Math.round(p * 100)}%`);
    html += `<div class="cell ${cls}${isToday ? ' today' : ''}" title="${label}" aria-label="${label}"><span>${n}</span>${p === null ? '' : `<small>${Math.round(p * 100)}%</small>`}</div>`;
  }
  $('calendar').innerHTML = html;
  $('monthSub').textContent = k ? `Средний процент за месяц: ${Math.round(100 * sum / k)}%` : 'В этом месяце пока нет данных';
  $('monthStats').innerHTML = tile(cnt.ok + cnt.ov, 'дней по плану') + tile(cnt.ov, 'сверх нормы') + tile(cnt.pt, 'частично') + tile(cnt.ms, 'пропусков');
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
if (page === 'leaderboard') {
  document.addEventListener('click', e => {
    if (e.target.dataset.board) { boardView.cid = e.target.dataset.board; renderBoard(); }
  });
  renderBoard();
}
if (page === 'stats') {
  document.addEventListener('click', e => {
    if (e.target.dataset.cid) { view.cid = e.target.dataset.cid; renderStatsPage(); }
    if (e.target.dataset.nav) { view.month = new Date(view.month.getFullYear(), view.month.getMonth() + Number(e.target.dataset.nav), 1); renderStatsPage(); }
  });
  renderStatsPage();
}