import { show, showNewMessage } from 'featurebase-js';
import { toast } from 'sonner';

const SUPPORT_EMAIL = 'hello@inflowft.com';

// The SDK starts as a queue stub (with `q`) and is replaced by the real dispatcher once
// sdk.js has loaded — so no `q` means the Messenger is live (not blocked or still loading).
const messengerLoaded = () => typeof window.Featurebase === 'function'
  && (!window.Featurebase.q || !!document.querySelector('iframe[src*="featurebase"]'));

// Opens the Featurebase Messenger (optionally pre-filled); falls back to email if chat isn't live.
export const talkToHuman = (text) => {
  if (!messengerLoaded()) {
    toast.info(`Live chat isn't available right now — email us at ${SUPPORT_EMAIL}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}`;
    return;
  }
  if (text) showNewMessage(text);
  else show();
};
