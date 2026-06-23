
import mixpanel from 'mixpanel-browser';

// ─── Cookie consent (UK PECR) ────────────────────────────────────────────────
// Mixpanel is non-essential analytics, so under UK law it must NOT run until the
// user has given consent. We do not init on import; the consent banner calls
// initMixpanel() only after the user accepts. Until then, track/identify/reset
// are silent no-ops and nothing is written to the device.
const CONSENT_KEY = 'womble_cookie_consent'; // 'accepted' | 'rejected'
export type CookieConsent = 'accepted' | 'rejected' | null;

let initialized = false;

export function getCookieConsent(): CookieConsent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

export function initMixpanel() {
  if (initialized) return;
  initialized = true;
  mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN || 'YOUR_MIXPANEL_TOKEN', {
    debug: import.meta.env.DEV,
    ignore_dnt: false,
    track_pageview: true,
    persistence: 'localStorage',
  });
}

/** Record acceptance and start analytics immediately. */
export function grantCookieConsent() {
  try { localStorage.setItem(CONSENT_KEY, 'accepted'); } catch {}
  initMixpanel();
}

/** Record rejection. Analytics stays off and nothing is initialised. */
export function denyCookieConsent() {
  try { localStorage.setItem(CONSENT_KEY, 'rejected'); } catch {}
}

/** Called on app load: re-enable analytics if the user previously accepted. */
export function initAnalyticsIfConsented() {
  if (getCookieConsent() === 'accepted') initMixpanel();
}

// Define Event Types for better type safety
export enum EventName {
  // Landing page events
  LANDING_GET_STARTED_CLICK = 'landing_get_started_click',
  LANDING_START_CREATING_CLICK = 'landing_start_creating_click',
  LANDING_HOW_IT_WORKS_CLICK = 'landing_how_it_works_click',
  LANDING_LOGIN_CLICK = 'landing_login_click',

  // Pricing section events
  PRICING_BUTTON_CLICK = 'pricing_button_click',

  // Auth events
  USER_LOGIN = 'user_login',
  USER_REGISTER = 'user_register',
  USER_GOOGLE_LOGIN = 'user_google_login',
  USER_MICROSOFT_LOGIN = 'user_microsoft_login',
  USER_LOGOUT = 'user_logout',

  // Activity creation
  GPT_CREATE_CLICK = 'gpt_create_click',
  ACTIVITY_TYPE_SELECTED = 'activity_type_selected',
  AI_GENERATION_USED = 'ai_generation_used',
  AI_GENERATION_SKIPPED = 'ai_generation_skipped',
  GPT_CONFIRM_CREATION = 'gpt_confirm_creation',
  ACTIVITY_EDITED = 'activity_edited',
  ACTIVITY_DELETED = 'activity_deleted',
  ACTIVITY_DUPLICATED = 'activity_duplicated',
  GPT_SHARE_LINK = 'gpt_share_link',
  TEMPLATE_USED = 'template_used',

  // Sessions
  SESSION_CREATED = 'session_created',

  // Learner session events
  SESSION_STARTED_TYPED = 'session_started_typed',
  SESSION_STARTED_VOICE = 'session_started_voice',
  SESSION_ENDED = 'session_ended',
  HINT_REQUESTED = 'hint_requested',
  FEEDBACK_REQUESTED = 'feedback_requested',
  FEEDBACK_SCORE = 'feedback_score',
}

// Type for the properties that can be passed to track
export interface EventProperties {
  [key: string]: any;
}

// Tracking function — no-op until the user has consented and Mixpanel is initialised
export const track = (event: EventName, properties: EventProperties = {}) => {
  if (!initialized) return;
  try {
    mixpanel.track(event, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Silent fail in case of tracking errors
    console.error('Mixpanel tracking error:', error);
  }
};

// Identify a user
export const identify = (userId: string, userProperties: Record<string, any> = {}) => {
  if (!initialized) return;
  try {
    mixpanel.identify(userId);
    if (Object.keys(userProperties).length > 0) {
      mixpanel.people.set(userProperties);
    }
  } catch (error) {
    console.error('Mixpanel identify error:', error);
  }
};

// Reset user identity (for logout)
export const reset = () => {
  if (!initialized) return;
  try {
    mixpanel.reset();
  } catch (error) {
    console.error('Mixpanel reset error:', error);
  }
};

export default {
  track,
  identify,
  reset,
  EventName
};
