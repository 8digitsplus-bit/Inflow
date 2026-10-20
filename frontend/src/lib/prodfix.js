import { prodfix } from '@prodfix/sdk';

const KEY = process.env.REACT_APP_PRODFIX_KEY;

// Errors + performance + UX friction only; privacy-heavy capture (response bodies, form
// contents, heatmaps, copy tracking, security hooks) is switched off. No-op without a key.
export function initProdfix() {
  if (!KEY) return;
  prodfix.init({
    key: KEY,
    environment: process.env.REACT_APP_PRODFIX_ENVIRONMENT,
    security: false,
    apiHealth: false,
    runtimeHooks: false,
    httpTracking: { captureResponseBody: false, captureResponseHeaders: false },
    ux: {
      rageClick: true, deadClick: true, slowInteraction: true, pageViews: true,
      formAbandonment: false, formFields: false, scrollDepth: false, heatmaps: false, copyTracking: false,
    },
    performance: { webVitals: true, longTasks: true },
  });
}

// ID + plan only — never email.
export function identifyProdfixUser(user) {
  if (KEY && user?.user_id) prodfix.identifyUser(user.user_id, { plan: user.subscription_tier || 'none' });
}

export function resetProdfixUser() {
  if (KEY) prodfix.reset();
}

export function captureProdfixError(error, context) {
  if (KEY) prodfix.captureError(error, context);
}
