import { show, showNewMessage } from 'featurebase-js';
import { toast } from 'sonner';

// Set once the Featurebase Messenger has booted (see FeaturebaseBoot).
let messengerReady = false;
export const setMessengerReady = (ready) => { messengerReady = ready; };

const SUPPORT_EMAIL = 'hello@inflowft.com';

// Opens the Featurebase Messenger (optionally pre-filled); falls back to email if chat isn't live.
export const talkToHuman = (text) => {
  if (!messengerReady) {
    toast.info(`Live chat isn't available right now — email us at ${SUPPORT_EMAIL}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}`;
    return;
  }
  if (text) showNewMessage(text);
  else show();
};
