const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const checks = [];
async function check(name, request, assertion) {
  const response = await request();
  const body = await response.text();
  assertion(response, body);
  checks.push(`${name}: ok`);
}
function expect(condition, message) { if (!condition) throw new Error(message); }
await check('health', () => fetch(`${baseUrl}/healthz`), (response, body) => {
  expect(response.status === 200, `expected 200, got ${response.status}`);
  expect(JSON.parse(body).status === 'ok', 'health status is not ok');
});
await check('security headers', () => fetch(`${baseUrl}/healthz`), response => {
  expect(response.headers.get('content-security-policy'), 'missing CSP');
  expect(response.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
  expect(response.headers.get('x-frame-options') === 'SAMEORIGIN' || response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'missing clickjacking protection');
});
await check('unauthenticated student route', () => fetch(`${baseUrl}/api/student/profile`), (response, body) => {
  expect(response.status === 401, `expected 401, got ${response.status}`);
  expect(JSON.parse(body).error === 'authentication_required', 'unexpected auth response');
});
await check('privacy page', () => fetch(`${baseUrl}/privacy.html`), (response, body) => {
  expect(response.status === 200 && body.includes('Privacy notice'), 'privacy page unavailable');
});
console.log(checks.join('\n'));
