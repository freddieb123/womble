
import mixpanel from 'mixpanel-browser';

// Initialize Mixpanel with the environment variable
mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN || 'YOUR_MIXPANEL_TOKEN', {
  debug: import.meta.env.DEV,
  ignore_dnt: false,
  track_pageview: true,
  persistence: 'localStorage',
});

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

// Tracking function
export const track = (event: EventName, properties: EventProperties = {}) => {
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
