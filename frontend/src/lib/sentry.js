import * as Sentry from '@sentry/react';

// Keys whose values must never leave the browser.
const SENSITIVE_KEYS = [
  'password', 'passwd', 'token', 'access_token', 'refresh_token', 'session_token',
  'authorization', 'api_key', 'apikey', 'secret', 'client_secret',
  'stripe_customer_id', 'stripe_subscription_id', 'card', 'cvc', 'cvv',
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function redact(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s)) ? '[Filtered]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[email]');
  return value;
}

export function initSentry() {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (!dsn) return; // no-op when not configured

  Sentry.init({
    dsn,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    ],
    tracesSampleRate: 0.1,
    enableLogs: true, // structured logs (console.warn/error forwarded)
    sendDefaultPii: false, // do not attach IP / cookies / user identifiers
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          for (const h of ['Authorization', 'authorization', 'Cookie', 'cookie', 'X-Api-Key']) {
            delete event.request.headers[h];
          }
        }
        if (event.request.data) event.request.data = redact(event.request.data);
      }
      if (event.extra) event.extra = redact(event.extra);
      if (event.contexts) event.contexts = redact(event.contexts);
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }
      return event;
    },
    beforeSendLog(log) {
      if (log && typeof log.body === 'string') log.body = log.body.replace(EMAIL_RE, '[email]');
      if (log && log.attributes) log.attributes = redact(log.attributes);
      return log;
    },
  });
}
