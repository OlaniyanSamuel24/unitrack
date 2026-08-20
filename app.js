const app = document.querySelector('#app');
const store = {
  user: null,
  courses: [],
  results: [],
  stats: null,
  theme: localStorage.getItem('unitrack-theme') || 'light',
  selectedCourseId: null,
  selectedSemester: null,
  courseTab: 'current',
  setup: {}
};
let current = 'splash';
const UI_LOGO = '<img class="brand-logo" src="/ui-logo.gif" alt="University of Ibadan logo">';

function brand() {
  return `<div class="brand">${UI_LOGO} UniTrack</div>`;
}

const ICONS = {
  home: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5 9 3l6 5.5V16H3V8.5Z"/><path d="M7 16v-5h4v5"/></svg>',
  courses: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="12" height="11" rx="1.5"/><path d="M6 8h6M6 11h4"/></svg>',
  results: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14V8m4 6V5m4 9v-4m4 4V7"/></svg>',
  calendar: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="12" height="11" rx="1.5"/><path d="M3 9h12M7 3v3M11 3v3"/></svg>',
  profile: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="7" r="2.4"/><path d="M4.2 15c.8-2.6 2.5-3.8 4.8-3.8s4 1.2 4.8 3.8"/></svg>',
  spark: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.2 4.2l2 2M9.8 9.8l2 2M11.8 4.2l-2 2M6.2 9.8l-2 2"/></svg>'
};

function applyTheme() {
  document.body.classList.toggle('theme-dark', store.theme === 'dark');
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
function firstName() {
  return store.user?.profile?.fullName?.split(' ')[0] || 'there';
}
function initials() {
  const name = store.user?.profile?.fullName || 'UT';
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}
function statusLabel(status) {
  if (status === 'completed' || status === 'Completed') return 'Completed';
  if (status === 'outstanding' || status === 'Outstanding') return 'Outstanding';
  return 'In progress';
}
function statusTone(status) {
  const label = statusLabel(status);
  return label === 'Completed' ? 'green' : label === 'Outstanding' ? 'purple' : 'amber';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}
async function loadOverview() {
  const { ok, body } = await api('/api/student/overview');
  if (!ok) {
    store.user = null;
    store.courses = [];
    store.results = [];
    store.stats = null;
    return false;
  }
  store.user = body.user;
  store.courses = body.courses || [];
  store.results = body.results || [];
  store.stats = body.stats;
  return true;
}
function stats() {
  return store.stats || { cgpa: 0, semesterGpa: 0, creditsCompleted: 0, creditsRequired: 150, progressPercent: 0, coursesCompleted: 0, coursesCurrent: 0, coursesOutstanding: 0, coursesTotal: 37 };
}
function networkStatus() {
  return '<div id="network-status" class="network-status" role="status" aria-live="polite" hidden></div>';
}
function installNetworkStatus() {
  let status = document.querySelector('#network-status');
  if (!status) {
    document.body.insertAdjacentHTML('afterbegin', networkStatus());
    status = document.querySelector('#network-status');
  }
  const update = () => {
    const offline = !navigator.onLine;
    status.hidden = !offline;
    status.textContent = offline ? 'You are offline. Saved information remains available; changes will sync when you reconnect.' : '';
  };
  window.removeEventListener('online', update);
  window.removeEventListener('offline', update);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
function shell(content, active = 'dashboard') {
  const nav = [
    ['dashboard', ICONS.home, 'Overview'],
    ['courses', ICONS.courses, 'Courses'],
    ['results', ICONS.results, 'Results'],
    ['calendar', ICONS.calendar, 'Calendar'],
    ['profile', ICONS.profile, 'Profile']
  ];
  const remaining = Math.max(0, stats().creditsRequired - stats().creditsCompleted);
  return `<div class="app-shell screen-enter">
    <aside class="sidebar">
      ${brand()}
      <nav class="side-nav">${nav.map(([id, icon, label]) => `<button class="${active === id ? 'active' : ''}" data-screen="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav>
      <div class="sidebar-note"><strong>Keep going, ${escapeHtml(firstName())}.</strong><br>You are ${stats().progressPercent}% of the way to your degree. ${remaining} credits remaining.</div>
    </aside>
    <main>
      <div class="topbar">
        ${brand()}
        <button class="avatar" data-screen="profile" aria-label="Open profile">${escapeHtml(initials())}</button>
      </div>
      ${content}
    </main>
    <nav class="bottom-nav">${nav.map(([id, icon, label]) => `<button class="nav-item ${active === id ? 'active' : ''}" data-screen="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav>
  </div>`;
}
function stat(icon, value, label) {
  return `<div class="card stat-card"><span class="stat-icon">${icon}</span><div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div></div>`;
}
function courseRows(items) {
  if (!items.length) return '<div class="empty-state"><strong>No courses in this view</strong><span>Records appear here after they are added to your academic profile.</span></div>';
  return items.map(course => `<button class="course-row" data-course="${escapeHtml(course.id || course.code)}" type="button"><span class="course-code">${escapeHtml(course.code)}</span><div class="course-info"><strong>${escapeHtml(course.title)}</strong><span>${escapeHtml(course.units)} Units · ${escapeHtml(course.lecturer || 'Lecturer TBC')}</span></div><span class="badge ${statusTone(course.status)}">${statusLabel(course.status)}</span></button>`).join('');
}
function dashboard() {
  const profile = store.user?.profile || {};
  const currentCourses = store.courses.filter(course => course.status === 'current');
  const recent = store.results.slice(0, 3);
  return shell(`<div class="header-copy dashboard-intro">
    <span class="eyebrow dashboard-kicker"><span>UI · EST. 1948</span><span>${escapeHtml(profile.level || 'Student')} / ${escapeHtml((profile.academicSession || '').replace('/', '–'))}</span></span>
    <span class="dashboard-label">Academic command centre</span>
    <h1>${greeting()}, ${escapeHtml(firstName())}</h1>
    <p>Your courses, results and graduation path — kept with the calm of a well-kept ledger.</p>
  </div>
  <div class="stats-grid grid">
    ${stat(ICONS.spark, stats().cgpa.toFixed(2), 'Current CGPA / 4.00')}
    ${stat('↗', stats().semesterGpa.toFixed(2), 'Latest semester GPA')}
    ${stat('◈', `${stats().creditsCompleted} / ${stats().creditsRequired}`, 'Credits completed')}
    ${stat('✓', `${stats().coursesCompleted} / ${stats().coursesTotal}`, 'Courses completed')}
  </div>
  <section class="card progress-card">
    <div class="progress-meta"><div><span class="small" style="color:#d8d0c0">Graduation progress</span><strong style="display:block">${stats().progressPercent}%</strong></div><span class="small">${stats().creditsCompleted} of ${stats().creditsRequired} credits</span></div>
    <div class="progress-track"><span style="width:${stats().progressPercent}%"></span></div>
    <span class="small" style="color:#d8d0c0">${Math.max(0, stats().creditsRequired - stats().creditsCompleted)} credits remaining · stay on the path to convocation.</span>
  </section>
  <div class="dashboard-columns">
    <section>
      <div class="section-heading"><h2>Current courses</h2><button class="text-button" data-screen="courses">View all →</button></div>
      <div class="card course-list">${courseRows(currentCourses)}</div>
    </section>
    <section>
      <div class="section-heading"><h2>Upcoming deadlines</h2><button class="text-button" data-screen="calendar">Calendar →</button></div>
      <div class="card deadline-list">
        <div class="deadline-row"><span class="deadline-date"><strong>14</strong>MAR</span><div class="course-info"><strong>Course registration</strong><span>Academic session 2025/2026</span></div><span class="badge red">Soon</span></div>
        <div class="deadline-row"><span class="deadline-date"><strong>18</strong>MAR</span><div class="course-info"><strong>Assignment window</strong><span>Harmattan assessments</span></div></div>
        <div class="deadline-row"><span class="deadline-date"><strong>26</strong>MAR</span><div class="course-info"><strong>Harmattan examinations</strong><span>Faculty timetable</span></div></div>
      </div>
      <div class="section-heading"><h2>Recent results</h2><button class="text-button" data-screen="results">See results →</button></div>
      <div class="card result-list">${recent.length ? recent.map(item => `<div class="result-row"><span class="course-code">${escapeHtml(item.code)}</span><div class="course-info"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.units)} Units · ${escapeHtml(item.academicSession)} ${escapeHtml(item.semester)}</span></div><strong style="color:var(--green)">${escapeHtml(item.grade || '—')}</strong></div>`).join('') : '<div class="empty-state"><strong>No published results yet</strong><span>Grades will appear here after they are recorded.</span></div>'}</div>
    </section>
  </div>`, 'dashboard');
}
function coursesView() {
  const groups = {
    current: store.courses.filter(course => course.status === 'current'),
    completed: store.courses.filter(course => course.status === 'completed'),
    outstanding: store.courses.filter(course => course.status === 'outstanding')
  };
  const active = store.courseTab;
  return shell(`<div class="header-copy"><span class="eyebrow">Academic record</span><h1>Courses</h1><p>Every paper in your programme, without the scramble through scattered notices.</p></div>
    <div class="tabs">
      <button class="tab ${active === 'current' ? 'active' : ''}" data-tab="current">Current <small>${groups.current.length}</small></button>
      <button class="tab ${active === 'completed' ? 'active' : ''}" data-tab="completed">Completed <small>${groups.completed.length}</small></button>
      <button class="tab ${active === 'outstanding' ? 'active' : ''}" data-tab="outstanding">Outstanding <small>${groups.outstanding.length}</small></button>
    </div>
    <div class="card course-list">${courseRows(groups[active])}</div>`, 'courses');
}
function courseDetail() {
  const course = store.courses.find(item => item.id === store.selectedCourseId || item.code === store.selectedCourseId) || store.courses[0];
  if (!course) return shell('<p class="muted">Course not found.</p>', 'courses');
  return shell(`<button class="detail-back" data-screen="courses">← Back to courses</button>
    <div class="detail-hero"><div class="course-emblem">${escapeHtml((course.code || '').split(' ')[0])}</div>
      <div><span class="eyebrow">${statusLabel(course.status)}</span><h1 style="font-size:32px">${escapeHtml(course.title)}</h1><p class="muted">${escapeHtml(course.code)} · ${escapeHtml(course.units)} Units</p></div>
    </div>
    <div class="info-grid">
      <div><span>Lecturer</span><strong>${escapeHtml(course.lecturer || 'To be confirmed')}</strong></div>
      <div><span>Semester</span><strong>${escapeHtml(course.semester || '—')}</strong></div>
      <div><span>Status</span><strong>${statusLabel(course.status)}</strong></div>
      <div><span>Grade</span><strong>${escapeHtml(course.grade || 'Pending')}</strong></div>
    </div>`, 'courses');
}
function groupedResults() {
  const groups = {};
  for (const item of store.results) {
    const key = `${item.academicSession} ${item.semester}`;
    groups[key] = groups[key] || { key, academicSession: item.academicSession, semester: item.semester, items: [] };
    groups[key].items.push(item);
  }
  return Object.values(groups).map(group => {
    const units = group.items.reduce((sum, item) => sum + Number(item.units || 0), 0);
    const quality = group.items.reduce((sum, item) => sum + Number(item.qualityPoints || 0), 0);
    return { ...group, units, gpa: units ? (quality / units).toFixed(2) : '0.00' };
  });
}
function resultsView() {
  const groups = groupedResults();
  return shell(`<div class="header-copy"><span class="eyebrow">Academic performance</span><h1>Results</h1><p>A clear view of how each semester has shaped your standing.</p></div>
    <div class="card" style="margin-top:22px">
      <div class="section-heading" style="margin-top:0"><div><span class="muted small">Cumulative</span><h2>CGPA ${stats().cgpa.toFixed(2)}</h2></div><span class="badge green">4.00 scale</span></div>
      <div class="chart">${(groups.length ? groups.slice(0, 4).reverse() : [{ gpa: 0, semester: '—' }]).map(group => `<div class="bar"><i style="height:${Math.max(12, Number(group.gpa) / 4 * 100)}%"></i>${escapeHtml((group.semester || '').slice(0, 3))}</div>`).join('')}</div>
    </div>
    <div class="section-heading"><h2>Semester results</h2></div>
    <div class="grid">${groups.length ? groups.map(group => `<button class="card" data-semester="${escapeHtml(group.key)}" style="text-align:left;display:flex;align-items:center;justify-content:space-between"><div><strong>${escapeHtml(group.academicSession)} ${escapeHtml(group.semester)}</strong><div class="muted small" style="margin-top:5px">${group.items.length} courses · ${group.units} Units</div></div><div style="text-align:right"><strong style="font-family:var(--serif);font-size:28px;color:var(--purple)">${group.gpa}</strong><div class="muted small">GPA →</div></div></button>`).join('') : '<div class="empty-state"><strong>No semester results yet</strong><span>When grades are recorded they will group here by session.</span></div>'}</div>`, 'results');
}
function resultDetail() {
  const group = groupedResults().find(item => item.key === store.selectedSemester) || groupedResults()[0];
  if (!group) return shell('<button class="detail-back" data-screen="results">← Back to results</button><p class="muted">No result selected.</p>', 'results');
  return shell(`<button class="detail-back" data-screen="results">← Back to results</button>
    <div class="header-copy"><span class="eyebrow">Semester result</span><h1>${escapeHtml(group.academicSession)} ${escapeHtml(group.semester)}</h1><p>GPA <strong style="color:var(--purple)">${group.gpa}</strong> · ${group.units} Units · ${group.items.length} courses</p></div>
    <div class="section-heading"><h2>Course breakdown</h2></div>
    <div class="card course-list">${group.items.map(item => `<div class="result-row"><span class="course-code">${escapeHtml(item.code)}</span><div class="course-info"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.units)} Units · ${escapeHtml(item.gradePoint)} points</span></div><strong style="color:${item.grade === 'A' ? 'var(--green)' : 'var(--purple)'}">${escapeHtml(item.grade || '—')}</strong></div>`).join('')}</div>`, 'results');
}
function calculator() {
  const rows = store.courses.filter(course => course.status === 'current');
  return shell(`<button class="detail-back" data-screen="profile">← Back to profile</button>
    <div class="header-copy"><span class="eyebrow">Plan your performance</span><h1>CGPA calculator</h1><p>Estimate this semester on the 4.00 scale used across UniTrack.</p></div>
    <div class="section-heading"><h2>Current semester</h2><span class="badge purple">4.00 scale</span></div>
    <div class="card grid" id="calc-rows">
      ${(rows.length ? rows : [{ code: 'NEW', title: 'New course', units: 3 }]).map(course => `<div class="course-row"><div class="course-info"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.title)}</strong><span>Course unit</span></div><input class="calc-units" type="number" value="${escapeHtml(course.units || 3)}" min="1" max="6" style="width:48px;height:36px;border:1px solid var(--line);border-radius:8px;text-align:center"><select class="calc-grade" style="width:62px;height:36px;border:1px solid var(--line);border-radius:8px"><option value="4">A</option><option value="3">B</option><option value="2">C</option><option value="1">D</option><option value="0">F</option></select></div>`).join('')}
      <button class="btn btn-secondary btn-wide" id="add-course" type="button">＋ Add course</button>
    </div>
    <div class="card" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between"><div><span class="muted small">Estimated semester GPA</span><strong id="calc-result" style="display:block;font-family:var(--serif);font-size:36px;color:var(--purple)">0.00</strong></div><button class="btn btn-primary" id="calculate" type="button">Calculate</button></div>`, 'profile');
}
function graduation() {
  const percent = stats().progressPercent;
  return shell(`<div class="header-copy"><span class="eyebrow">Your degree journey</span><h1>Graduation progress</h1><p>Every credit is a step toward convocation.</p></div>
    <div class="card" style="margin-top:22px;display:flex;align-items:center;gap:22px"><div class="circle" style="--progress:${percent}%"><div class="circle-content"><strong>${percent}%</strong><span>complete</span></div></div><div><h2>${percent >= 70 ? "You're on track" : 'Keep building'}</h2><p class="muted small" style="margin-top:8px">${stats().creditsCompleted} of ${stats().creditsRequired} credits completed</p><strong style="display:block;margin-top:14px;color:var(--purple)">${Math.max(0, stats().creditsRequired - stats().creditsCompleted)} credits remaining</strong></div></div>
    <div class="section-heading"><h2>Requirements</h2></div>
    <div class="card grid">${[['Core courses', 'In progress', stats().coursesCompleted > 8], ['Elective courses', 'In progress', false], ['GST requirements', stats().coursesCompleted ? 'On record' : 'Pending', store.courses.some(course => String(course.code).startsWith('GST'))], ['Final year project', store.courses.some(course => /499|project/i.test(course.code + course.title)) ? 'In progress' : 'Upcoming', false]].map(item => `<div class="course-row"><span class="list-icon">${item[2] ? '✓' : '◷'}</span><div class="course-info"><strong>${item[0]}</strong><span>${item[1]}</span></div><span class="badge ${item[2] ? 'green' : 'amber'}">${item[2] ? 'Completed' : 'In progress'}</span></div>`).join('')}</div>`, 'profile');
}
function calendar() {
  return shell(`<div class="header-copy"><span class="eyebrow">2025/2026 academic session</span><h1>Academic calendar</h1><p>Registration, assessments and examinations in one view.</p></div>
    <div class="card" style="margin-top:22px">
      <div class="section-heading" style="margin-top:0"><h2>March 2026</h2></div>
      <div class="calendar-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => `<span>${day}</span>`).join('')}${Array.from({ length: 31 }, (_, index) => `<span class="calendar-day ${[14, 18, 24, 26].includes(index + 1) ? 'marked' : ''}">${index + 1}</span>`).join('')}</div>
    </div>
    <div class="section-heading"><h2>Upcoming events</h2></div>
    <div class="card deadline-list">${[['14', 'Course registration', 'Registration', 'amber'], ['18', 'Assessment window', 'Assessment', 'purple'], ['24', 'Project checkpoint', 'Project', 'green'], ['26', 'Harmattan examinations', 'Examination', 'purple']].map(item => `<div class="deadline-row"><span class="deadline-date"><strong>${item[0]}</strong>MAR</span><div class="course-info"><strong>${item[1]}</strong><span>${item[2]} · 2025/2026</span></div><span class="badge ${item[3]}">●</span></div>`).join('')}</div>`, 'calendar');
}
function profileView() {
  const profile = store.user?.profile || {};
  return shell(`<div class="header-copy"><span class="eyebrow">Student profile</span><h1>Your profile</h1><p>The academic identity UniTrack uses to personalise your dashboard.</p></div>
    <div class="card" style="margin-top:22px;text-align:center"><div class="avatar" style="margin:auto;width:72px;height:72px;font-size:22px">${escapeHtml(initials())}</div><h2 style="margin-top:14px">${escapeHtml(profile.fullName || 'Student')}</h2><p class="muted" style="margin-top:6px">${escapeHtml(profile.department || '')} · ${escapeHtml(profile.level || '')}</p><span class="badge purple" style="margin-top:12px">${escapeHtml(profile.academicSession || '')}</span></div>
    <div class="section-heading"><h2>Academic information</h2></div>
    <div class="card info-grid">${[['Matric number', profile.matricNumber], ['Faculty', profile.faculty], ['Department', profile.department], ['Programme', profile.programme], ['Level', profile.level], ['Academic session', profile.academicSession]].map(item => `<div><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(item[1] || '—')}</strong></div>`).join('')}</div>
    <div class="section-heading"><h2>Account</h2></div>
    <div class="card">
      <button class="course-row" data-screen="calculator" type="button"><div class="course-info"><strong>CGPA calculator</strong><span>Estimate your next semester GPA</span></div><span class="text-button">→</span></button>
      <button class="course-row" data-screen="graduation" type="button"><div class="course-info"><strong>Graduation progress</strong><span>See remaining credits</span></div><span class="text-button">→</span></button>
      <button class="course-row" data-screen="settings" type="button"><div class="course-info"><strong>Settings</strong><span>Appearance, privacy and sign out</span></div><span class="text-button">→</span></button>
    </div>`, 'profile');
}
function settings() {
  return shell(`<button class="detail-back" data-screen="profile">← Back to profile</button>
    <div class="header-copy"><span class="eyebrow">Preferences</span><h1>Settings</h1><p>Make UniTrack feel like a well-ordered study.</p></div>
    <div class="section-heading"><h2>General</h2></div>
    <div class="card grid">
      <div class="course-row"><span class="list-icon">☼</span><div class="course-info"><strong>Appearance</strong><span>${store.theme === 'dark' ? 'Dark gold evening mode' : 'Parchment light mode'}</span></div><button class="switch ${store.theme === 'dark' ? 'on' : ''}" id="theme-toggle" type="button" aria-label="Toggle appearance"></button></div>
      <button class="course-row" id="export-data" type="button"><span class="list-icon">◇</span><div class="course-info"><strong>Export my data</strong><span>Download a copy of your UniTrack records</span></div><span>→</span></button>
    </div>
    <div class="section-heading"><h2>Support</h2></div>
    <div class="card grid">
      <a class="course-row" href="/privacy.html"><div class="course-info"><strong>Privacy notice</strong><span>How UniTrack handles student information</span></div><span>→</span></a>
      <button class="course-row" id="logout" type="button"><div class="course-info"><strong>Log out</strong><span>Sign out of this device</span></div><span style="color:var(--red)">→</span></button>
      <button class="course-row" id="delete-account" type="button"><div class="course-info"><strong>Delete account</strong><span>Permanently remove this UniTrack account</span></div><span style="color:var(--red)">→</span></button>
    </div>
    <p id="settings-message" class="small form-message" role="status"></p>`, 'profile');
}
function onboarding(step = 0) {
  const data = [
    ['Know where you stand.', 'Track CGPA, GPA, courses and academic progress in one quiet, well-composed dashboard.'],
    ['Stay on track to graduate.', 'See completed credits, outstanding courses and how close you are to convocation.'],
    ['Never miss a deadline.', 'Keep registration, assignments, examinations and faculty dates in a single calendar.']
  ][step];
  return `<div class="onboard-shell screen-enter"><div class="topbar">${brand()}<button class="skip" data-screen="create-account">Skip</button></div>
    <div class="onboard-art"><div class="art-panel"><span class="eyebrow">${step === 0 ? 'Academic overview' : step === 1 ? 'Degree progress' : 'Upcoming dates'}</span><div style="font-family:var(--serif);font-size:28px;margin-top:14px;color:var(--purple)">0${step + 1}</div><div class="mini-line gold"></div><div class="mini-line"></div><div class="mini-line" style="width:75%"></div></div></div>
    <div class="onboard-copy"><div class="dots">${[0, 1, 2].map(index => `<i class="${index === step ? 'active' : ''}"></i>`).join('')}</div><h1>${data[0]}</h1><p>${data[1]}</p></div>
    <div class="onboard-actions"><button class="btn btn-primary" data-screen="${step === 2 ? 'create-account' : `onboard-${step + 1}`}">${step === 2 ? 'Get started' : 'Next'} <span>→</span></button></div></div>`;
}
function createAccount() {
  return `<div class="auth-shell screen-enter"><div class="auth-top">${brand()}<button class="text-button" data-screen="login">Log in</button></div>
    <div class="auth-content"><span class="eyebrow">University of Ibadan</span><h1>Create your account</h1><p>Start with your email and password, then add your student details to finish setting up your record.</p>
      <div class="account-fields">
        <label for="account-email">Email address</label>
        <input id="account-email" type="email" autocomplete="email" placeholder="you@example.com" required>
        <label for="account-password">Password</label>
        <input id="account-password" type="password" autocomplete="new-password" placeholder="At least 12 characters" minlength="12" required>
        <label class="consent-row"><input id="account-consent" type="checkbox" required> <span>I agree to the <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a> and UniTrack terms.</span></label>
      </div>
      <div class="auth-actions">
        <button class="btn btn-secondary btn-wide" type="button" data-oauth="google"><img class="provider-icon" src="/icons/google.svg" alt=""> Continue with Google</button>
        <button class="btn btn-secondary btn-wide" type="button" data-oauth="apple"><img class="provider-icon" src="/icons/apple.svg" alt=""> Continue with Apple</button>
        <button class="btn btn-primary btn-wide" type="button" data-screen="student-info">Continue to student details →</button>
      </div>
      <p id="setup-error" class="small form-message" role="alert"></p>
    </div>
    <p class="auth-footer">Already have an account? <button data-screen="login">Log in</button></p></div>`;
}
function login() {
  return `<div class="auth-shell screen-enter"><div class="auth-top"><button class="detail-back" data-screen="create-account">← Back</button>${brand()}<span></span></div>
    <div class="auth-content"><span class="eyebrow">Welcome back</span><h1>Welcome back</h1><p>Sign in to continue your academic record.</p>
      <div class="form">
        <div class="field"><label for="login-email">Email address</label><input id="login-email" type="email" autocomplete="email" placeholder="you@example.com"></div>
        <div class="field"><label for="login-password">Password</label><input id="login-password" type="password" autocomplete="current-password"></div>
        <button class="text-button" id="forgot-password" type="button" style="text-align:right">Forgot password?</button>
        <button class="btn btn-primary btn-wide" id="login-submit" aria-busy="false">Log in →</button>
        <p id="login-error" class="small form-message" role="alert"></p>
      </div>
    </div>
    <p class="auth-footer">New to UniTrack? <button data-screen="create-account">Create account</button></p></div>`;
}
function resetPassword() {
  return `<div class="auth-shell screen-enter"><div class="auth-top"><button class="detail-back" data-screen="login">← Back</button>${brand()}<span></span></div>
    <div class="auth-content"><span class="eyebrow">Account recovery</span><h1>Choose a new password</h1><p>Use at least 12 characters. This will sign out other devices.</p>
      <div class="form">
        <div class="field"><label for="reset-password">New password</label><input id="reset-password" type="password" autocomplete="new-password" minlength="12"></div>
        <button class="btn btn-primary btn-wide" id="reset-submit">Update password</button>
        <p id="reset-error" class="small form-message" role="alert"></p>
      </div>
    </div></div>`;
}
function setup(step) {
  const headings = [['Let’s get to know you', 'Tell us a little about yourself.'], ['Select your faculty', 'Which faculty are you in?'], ['Select your department', 'Choose your course of study.'], ['Tell us about your academic journey', 'This helps us personalise your dashboard.']];
  const body = [
    `<div class="field"><label for="full-name">Full name</label><input id="full-name" value="${escapeHtml(store.setup.fullName || '')}"></div><div class="field"><label for="matric">Matric number</label><input id="matric" placeholder="e.g. CST/19/1234" value="${escapeHtml(store.setup.matricNumber || '')}"></div>`,
    `<div class="field"><label for="faculty">Faculty</label><select id="faculty"><option>Faculty of Technology</option><option>Faculty of Science</option><option>Faculty of Social Sciences</option><option>Faculty of Arts</option><option>Faculty of Education</option></select></div>`,
    `<div class="field"><label for="faculty-2">Faculty</label><select id="faculty-2"><option>Faculty of Technology</option><option>Faculty of Science</option></select></div><div class="field"><label for="department">Department</label><select id="department"><option>Computer Science</option><option>Computer Engineering</option><option>Electrical Engineering</option><option>Statistics</option></select></div>`,
    `<div class="field"><label>Level</label><div class="pill-select">${['100', '200', '300', '400', '500'].map(level => `<button type="button" class="${(store.setup.level || '400 Level') === `${level} Level` ? 'selected' : ''}">${level} Level</button>`).join('')}</div></div><div class="field"><label for="session">Academic session</label><select id="session"><option>2025/2026</option><option>2024/2025</option></select></div>`
  ];
  return `<div class="auth-shell screen-enter"><div class="topbar">${brand()}<span class="eyebrow">Step ${step + 1} of 4</span></div>
    <div class="auth-content"><div style="height:5px;background:var(--lilac);border-radius:4px;margin-bottom:30px"><span style="display:block;height:100%;width:${(step + 1) * 25}%;background:var(--gold);border-radius:inherit"></span></div>
    <h1>${headings[step][0]}</h1><p>${headings[step][1]}</p>
    <div class="form">${body[step]}<button class="btn btn-primary btn-wide" data-screen="${step === 3 ? 'setup-success' : `setup-${step + 1}`}">${step === 3 ? 'Finish setup' : 'Continue'} →</button><p id="setup-error" class="small form-message" role="alert"></p></div></div></div>`;
}
function success() {
  return `<div class="auth-shell screen-enter" style="text-align:center"><div class="brand" style="justify-content:center">${UI_LOGO} UniTrack</div>
    <div class="auth-content"><div class="logo-large" style="margin:0 auto;background:var(--gold-soft);color:var(--gold-deep);font-size:38px;border:0">✓</div><h1>You’re all set</h1><p>Your UniTrack dashboard is ready.</p><button class="btn btn-primary btn-wide" style="margin-top:30px" data-screen="dashboard">Go to Dashboard →</button></div></div>`;
}

const screens = {
  dashboard, courses: coursesView, 'course-detail': courseDetail, results: resultsView, 'result-detail': resultDetail,
  calculator, graduation, calendar, profile: profileView, settings,
  'onboard-0': () => onboarding(0), 'onboard-1': () => onboarding(1), 'onboard-2': () => onboarding(2),
  'create-account': createAccount, login, 'reset-password': resetPassword,
  'student-info': () => setup(0), 'setup-1': () => setup(1), 'setup-2': () => setup(2), 'setup-3': () => setup(3),
  'setup-success': success
};

function collectSetup() {
  const heading = document.querySelector('h1')?.textContent || '';
  if (heading.includes('get to know')) {
    store.setup.fullName = document.querySelector('#full-name')?.value.trim();
    store.setup.matricNumber = document.querySelector('#matric')?.value.trim();
  } else if (heading.includes('faculty')) {
    store.setup.faculty = document.querySelector('#faculty')?.value;
  } else if (heading.includes('department')) {
    store.setup.faculty = document.querySelector('#faculty-2')?.value;
    store.setup.department = document.querySelector('#department')?.value;
  } else if (heading.includes('academic journey')) {
    store.setup.level = document.querySelector('.pill-select .selected')?.textContent.trim();
    store.setup.academicSession = document.querySelector('#session')?.value;
  }
}
async function registerAccount() {
  const payload = {
    email: store.setup.email,
    password: store.setup.password,
    fullName: store.setup.fullName,
    matricNumber: store.setup.matricNumber,
    faculty: store.setup.faculty,
    department: store.setup.department,
    programme: `B.Sc. ${store.setup.department}`,
    level: store.setup.level,
    academicSession: store.setup.academicSession,
    consent: store.setup.consent,
    consentVersion: '2026-08-19'
  };
  if (Object.values(payload).some(value => !value)) throw new Error('Complete all profile fields before finishing setup.');
  const { ok, body } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  if (!ok) throw new Error(body.error === 'email_already_registered' ? 'That email is already registered.' : body.error === 'matric_number_already_registered' ? 'That matric number is already registered.' : body.error === 'validation_error' ? 'Check the highlighted account details and try again.' : 'Registration could not be completed. Try again.');
  await loadOverview();
}

function render(name) {
  current = name;
  applyTheme();
  app.innerHTML = name === 'splash'
    ? `<div class="splash"><div class="splash-inner"><div class="logo-large"><img src="/ui-logo.gif" alt="University of Ibadan logo"></div><h1>UniTrack</h1><p>Your academic journey, composed in one place.</p><div class="loader"></div></div></div>`
    : screens[name]();
  installNetworkStatus();
}
window.render = render;
window.courseRows = courseRows;

app.addEventListener('click', async event => {
  const oauth = event.target.closest('[data-oauth]');
  if (oauth) {
    window.location.href = `/api/auth/${oauth.dataset.oauth}`;
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    store.courseTab = tab.dataset.tab;
    render('courses');
    return;
  }
  const pill = event.target.closest('.pill-select button');
  if (pill) {
    document.querySelectorAll('.pill-select button').forEach(button => button.classList.remove('selected'));
    pill.classList.add('selected');
    return;
  }
  if (event.target.closest('#theme-toggle')) {
    store.theme = store.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('unitrack-theme', store.theme);
    render('settings');
    return;
  }
  if (event.target.closest('#forgot-password')) {
    const email = document.querySelector('#login-email')?.value.trim();
    const error = document.querySelector('#login-error');
    if (!email) { error.textContent = 'Enter your email address first.'; return; }
    await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    error.classList.add('success-message');
    error.textContent = 'If the account exists, reset instructions will be sent.';
    return;
  }
  if (event.target.closest('#logout')) {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    store.user = null;
    render('login');
    return;
  }
  if (event.target.closest('#delete-account')) {
    if (!confirm('Delete this UniTrack account permanently?')) return;
    const { ok } = await api('/api/privacy/account', { method: 'DELETE' });
    if (ok) { store.user = null; render('create-account'); }
    return;
  }
  if (event.target.closest('#export-data')) {
    const { ok, body } = await api('/api/privacy/export');
    const message = document.querySelector('#settings-message');
    if (!ok) { message.textContent = 'Export is only available while signed in.'; return; }
    const file = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = 'unitrack-export.json';
    link.click();
    message.classList.add('success-message');
    message.textContent = 'A copy of your data has been downloaded.';
    return;
  }
  if (event.target.closest('#calculate')) {
    const units = [...document.querySelectorAll('.calc-units')].map(input => Number(input.value) || 0);
    const grades = [...document.querySelectorAll('.calc-grade')].map(select => Number(select.value) || 0);
    const total = units.reduce((sum, unit) => sum + unit, 0);
    const quality = grades.reduce((sum, grade, index) => sum + grade * units[index], 0);
    document.querySelector('#calc-result').textContent = total ? (quality / total).toFixed(2) : '0.00';
    return;
  }
  if (event.target.closest('#add-course')) {
    event.target.closest('#add-course').insertAdjacentHTML('beforebegin', '<div class="course-row"><div class="course-info"><strong>New course</strong><span>Course unit</span></div><input class="calc-units" type="number" value="3" min="1" max="6" style="width:48px;height:36px;border:1px solid var(--line);border-radius:8px;text-align:center"><select class="calc-grade" style="width:62px;height:36px;border:1px solid var(--line);border-radius:8px"><option value="4">A</option><option value="3">B</option><option value="2">C</option></select></div>');
    return;
  }
  if (event.target.closest('#login-submit')) {
    const button = document.querySelector('#login-submit');
    const error = document.querySelector('#login-error');
    button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Checking…'; error.textContent = '';
    try {
      const { ok, status } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.querySelector('#login-email').value, password: document.querySelector('#login-password').value }) });
      if (!ok) throw new Error(status === 401 ? 'Email or password is incorrect.' : 'UniTrack is temporarily unavailable. Try again.');
      await loadOverview();
      render('dashboard');
    } catch (requestError) {
      error.textContent = !navigator.onLine ? 'You appear to be offline. Reconnect and try again.' : requestError.message;
      button.disabled = false; button.setAttribute('aria-busy', 'false'); button.textContent = 'Log in →';
    }
    return;
  }
  if (event.target.closest('#reset-submit')) {
    const token = new URLSearchParams(location.search).get('token');
    const { ok } = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: document.querySelector('#reset-password').value }) });
    const error = document.querySelector('#reset-error');
    if (!ok) { error.textContent = 'This reset link is invalid or has expired.'; return; }
    error.classList.add('success-message');
    error.textContent = 'Password updated. You can log in now.';
    setTimeout(() => render('login'), 900);
    return;
  }
  const courseButton = event.target.closest('[data-course]');
  if (courseButton) {
    store.selectedCourseId = courseButton.dataset.course;
    render('course-detail');
    return;
  }
  const semesterButton = event.target.closest('[data-semester]');
  if (semesterButton) {
    store.selectedSemester = semesterButton.dataset.semester;
    render('result-detail');
    return;
  }
  const target = event.target.closest('[data-screen]');
  if (!target) return;
  const destination = target.dataset.screen;
  if (current === 'create-account' && destination === 'student-info') {
    const emailInput = document.querySelector('#account-email');
    const passwordInput = document.querySelector('#account-password');
    store.setup.email = emailInput?.value.trim();
    store.setup.password = passwordInput?.value;
    store.setup.consent = document.querySelector('#account-consent')?.checked === true;
    if (!emailInput?.checkValidity()) {
      event.preventDefault();
      emailInput?.reportValidity();
      document.querySelector('#setup-error').textContent = 'Enter a valid email address to continue.';
      return;
    }
    if (!passwordInput?.checkValidity() || !store.setup.consent) {
      event.preventDefault();
      document.querySelector('#setup-error').textContent = !passwordInput?.checkValidity() ? 'Use a password with at least 12 characters.' : 'Accept the privacy notice to continue.';
      return;
    }
  }
  if (destination?.startsWith('setup-')) collectSetup();
  if (destination === 'setup-success') {
    event.preventDefault();
    collectSetup();
    target.disabled = true; target.setAttribute('aria-busy', 'true'); target.textContent = 'Creating account…';
    try {
      await registerAccount();
      render('setup-success');
    } catch (error) {
      document.querySelector('#setup-error').textContent = error.message;
      target.disabled = false; target.setAttribute('aria-busy', 'false'); target.textContent = 'Finish setup →';
    }
    return;
  }
  if (['dashboard', 'courses', 'results', 'calendar', 'profile', 'graduation', 'calculator', 'settings'].includes(destination) && !store.user) {
    const signedIn = await loadOverview();
    if (!signedIn) { render('login'); return; }
  }
  render(destination);
});

applyTheme();
(async () => {
  render('splash');
  const params = new URLSearchParams(location.search);
  if (params.get('token') && location.pathname.includes('reset-password')) {
    setTimeout(() => render('reset-password'), 700);
    return;
  }
  const signedIn = await loadOverview();
  setTimeout(() => render(signedIn ? 'dashboard' : 'onboard-0'), 1100);
})();
