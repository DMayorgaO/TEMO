const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthController } = require('../dist/modules/auth/auth.controller');

const request = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, user: { id: 'actor' } };
const challenge = 'A'.repeat(43);
const valid = {
  login: { username: ' ADMIN ', password: ' Password123! ' },
  requestPasswordRecovery: { identifier: ' admin@example.invalid ' },
  confirmPasswordRecovery: { identifier: ' admin ', code: '012345', newPassword: ' NewPassword123! ' },
  verifyMfa: { challenge, code: '012345', recoveryCode: '' },
  changePassword: { currentPassword: ' Password123! ', newPassword: ' NewPassword123! ' },
  changeProfilePhoto: { photoDataUrl: 'data:image/png;base64,AAAA' },
};

test('auth endpoints reject non-objects, missing fields and unknown keys before service work', () => {
  let calls = 0;
  const controller = new AuthController(Object.fromEntries(Object.keys(valid).map(name => [name, () => calls++])));
  for (const [name, payload] of Object.entries(valid)) {
    for (const malformed of [null, [], 'secret-submitted-value', 123, {}, { ...payload, roleCode: 'JEFA' }]) {
      assert.throws(() => controller[name](malformed, request), error => {
        assert.equal(error.getStatus(), 400);
        assert.ok(!JSON.stringify(error.getResponse()).includes('secret-submitted-value'));
        return true;
      });
    }
  }
  assert.equal(calls, 0);
});

test('auth fields never coerce objects, arrays or numbers to strings and reject oversized inputs', () => {
  const controller = new AuthController({});
  for (const [name, payload] of Object.entries(valid)) {
    for (const field of Object.keys(payload)) {
      for (const value of [null, {}, ['012345'], 123456, 'x'.repeat(field === 'photoDataUrl' ? 200001 : 255)]) {
        assert.throws(() => controller[name]({ ...payload, [field]: value }, request), error => error.getStatus() === 400);
      }
    }
  }
});

test('database-bound identifiers and passwords refuse null bytes without changing valid whitespace', () => {
  const controller = new AuthController({});
  for (const name of ['login', 'requestPasswordRecovery', 'confirmPasswordRecovery', 'changePassword']) {
    for (const field of Object.keys(valid[name]).filter(field => field !== 'code')) {
      assert.throws(() => controller[name]({ ...valid[name], [field]: 'ValidPassword123!\0' }, request),
        error => error.getStatus() === 400);
    }
  }
});

test('valid requests preserve password whitespace and leading OTP zero while trimming identifiers', () => {
  const calls = [];
  const controller = new AuthController(Object.fromEntries(Object.keys(valid).map(name => [name, (...args) => calls.push([name, args])])));
  for (const [name, payload] of Object.entries(valid)) controller[name](payload, request);
  assert.deepEqual(calls[0], ['login', ['ADMIN', ' Password123! ', '127.0.0.1', 'test']]);
  assert.deepEqual(calls[1], ['requestPasswordRecovery', ['admin@example.invalid', '127.0.0.1', 'test']]);
  assert.deepEqual(calls[2], ['confirmPasswordRecovery', ['admin', '012345', ' NewPassword123! ', '127.0.0.1', 'test']]);
  assert.deepEqual(calls[3], ['verifyMfa', [challenge, '012345', '', '127.0.0.1', 'test']]);
  assert.deepEqual(calls[4], ['changePassword', [request.user, ' Password123! ', ' NewPassword123! ', '127.0.0.1', 'test']]);
});

test('MFA accepts exactly one factor in supported format, not ambiguous combinations', () => {
  const accepted = [];
  const controller = new AuthController({ verifyMfa: (...args) => accepted.push(args) });
  const recovery = 'abcdef-123456-abcdef-123456';
  controller.verifyMfa({ challenge, recoveryCode: recovery }, request);
  controller.verifyMfa({ challenge, recoveryCode: recovery.replaceAll('-', '') }, request);
  controller.verifyMfa({ challenge, code: '012345' }, request);
  assert.equal(accepted.length, 3);
  for (const payload of [{ challenge }, { challenge, code: '012345', recoveryCode: recovery },
    { challenge, code: '12345' }, { challenge, code: '12 345' }, { challenge, recoveryCode: 'a'.repeat(25) },
    { challenge: '../bad-token', code: '012345' }]) {
    assert.throws(() => controller.verifyMfa(payload, request), error => error.getStatus() === 400);
  }
  assert.equal(accepted.length, 3);
});
