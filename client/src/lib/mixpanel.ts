import mixpanel from 'mixpanel-browser';

// Initialize Mixpanel
// Replace with your Mixpanel token when ready to use
// For now, we're using a placeholder
mixpanel.init('VITE_MIXPANEL_TOKEN', {
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
  
  // GPT-related events
  GPT_CREATE_CLICK = 'gpt_create_click',
  GPT_CONFIRM_CREATION = 'gpt_confirm_creation',
  GPT_SHARE_LINK = 'gpt_share_link'
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