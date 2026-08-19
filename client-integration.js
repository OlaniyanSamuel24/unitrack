(() => {
  const state = {};
  let lastDashboardUser = null;
  const app = document.querySelector('#app');

  function showFormError(message) {
    let alert = document.querySelector('#setup-error');
    if (!alert) {
      alert = document.createElement('p');
      alert.id = 'setup-error';
      alert.className = 'small form-message';
      alert.setAttribute('role', 'alert');
      document.querySelector('.auth-actions, .form')?.append(alert);
    }
    alert.textContent = message;
  }

  function enhanceCreateAccount() {
    const actions = document.querySelector('.auth-actions');
    if (!actions || !document.querySelector('h1')?.textContent.includes('Create your account')) return;
    if (!document.querySelector('#account-email')) actions.insertAdjacentHTML('beforebegin', '<div class="field account-fields"><label for="account-email">Email address</label><input id="account-email" type="email" autocomplete="email" placeholder="you@example.com" required><label for="account-password">Password</label><input id="account-password" type="password" autocomplete="new-password" placeholder="At least 12 characters" minlength="12" required><label class="consent-row"><input id="account-consent" type="checkbox" required> <span>I agree to the <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a> and UniTrack terms.</span></label></div>');
    const providers = [...actions.querySelectorAll('button')];
    const google = providers.find(button => button.textContent.includes('Google'));
    const apple = providers.find(button => button.textContent.includes('Apple'));
    if (google && !google.querySelector('img')) google.innerHTML = '<img class="provider-icon" src="/icons/google.svg" alt=""> Continue with Google';
    if (apple && !apple.querySelector('img')) apple.innerHTML = '<img class="provider-icon" src="/icons/apple.svg" alt=""> Continue with Apple';
  }

  function collectSetupStep() {
    const heading = document.querySelector('h1')?.textContent || '';
    const fields = [...document.querySelectorAll('.field input, .field select')];
    if (heading.includes('get to know')) {
      state.fullName = fields[0]?.value.trim(); state.matricNumber = fields[1]?.value.trim();
    } else if (heading.includes('faculty')) {
      state.faculty = fields[0]?.value;
    } else if (heading.includes('department')) {
      state.faculty = fields[0]?.value; state.department = fields[1]?.value;
    } else if (heading.includes('academic journey')) {
      state.level = document.querySelector('.pill-select .selected')?.textContent.trim(); state.academicSession = fields[0]?.value;
    }
  }

  async function register() {
    const payload = { email: state.email, password: state.password, fullName: state.fullName, matricNumber: state.matricNumber, faculty: state.faculty, department: state.department, programme: `B.Sc. ${state.department}`, level: state.level, academicSession: state.academicSession, consent: state.consent, consentVersion: '2026-08-19' };
    if (Object.values(payload).some(value => !value)) throw new Error('Complete all profile fields before finishing setup.');
    const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error === 'email_already_registered' ? 'That email is already registered.' : body.error === 'matric_number_already_registered' ? 'That matric number is already registered.' : body.error === 'validation_error' ? 'Check the highlighted account details and try again.' : 'Registration could not be completed. Try again.');
    window.render('setup-success');
  }

  async function hydrateDashboard() {
    if (!document.querySelector('.dashboard-intro') || lastDashboardUser) return;
    lastDashboardUser = true;
    try {
      const [profileResponse, coursesResponse] = await Promise.all([fetch('/api/student/profile', { credentials: 'include' }), fetch('/api/student/courses', { credentials: 'include' })]);
      if (!profileResponse.ok || !coursesResponse.ok) return;
      const profileBody = await profileResponse.json(); const coursesBody = await coursesResponse.json();
      const student = profileBody.profile;
      if (student?.full_name) document.querySelector('.dashboard-intro h1').textContent = `Good afternoon, ${student.full_name.split(' ')[0]}`;
      const currentCourses = (coursesBody.courses || []).filter(course => course.status === 'current');
      const list = document.querySelector('.dashboard-columns .course-list');
      if (list && currentCourses.length) list.innerHTML = window.courseRows(currentCourses);
      if (list && !currentCourses.length) list.innerHTML = '<div class="empty-state"><strong>No course records yet</strong><span>Your courses will appear here after they are added to your academic profile.</span></div>';
    } catch (error) {
      lastDashboardUser = null;
    }
  }

  document.addEventListener('click', event => {
    const providerButton = event.target.closest('.auth-actions button');
    if (providerButton?.textContent.includes('Google')) { window.location.href = '/api/auth/google'; return; }
    if (providerButton?.textContent.includes('Apple')) { window.location.href = '/api/auth/apple'; return; }
    if (event.target.closest('.text-button')?.textContent.includes('Forgot password')) {
      const email = document.querySelector('#login-email')?.value.trim();
      if (!email) { document.querySelector('#login-error').textContent = 'Enter your email address first.'; return; }
      fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(() => { document.querySelector('#login-error').textContent = 'If the account exists, reset instructions will be sent.'; });
      return;
    }
    const button = event.target.closest('[data-screen]');
    if (!button) return;
    const destination = button.dataset.screen;
    if (document.querySelector('h1')?.textContent.includes('Create your account') && destination === 'student-info') {
      state.email = document.querySelector('#account-email')?.value.trim(); state.password = document.querySelector('#account-password')?.value; state.consent = document.querySelector('#account-consent')?.checked === true;
    }
    if (destination?.startsWith('setup-')) collectSetupStep();
    if (destination === 'setup-success') {
      event.preventDefault(); event.stopImmediatePropagation();
      collectSetupStep(); button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Creating account…';
      register().catch(error => { showFormError(error.message); button.disabled = false; button.setAttribute('aria-busy', 'false'); button.textContent = 'Finish setup →'; });
    }
  }, true);

  const observer = new MutationObserver(() => { enhanceCreateAccount(); hydrateDashboard(); });
  observer.observe(app, { childList: true, subtree: true });
  enhanceCreateAccount();
})();
