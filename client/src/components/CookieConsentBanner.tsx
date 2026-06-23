import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  getCookieConsent,
  grantCookieConsent,
  denyCookieConsent,
  initAnalyticsIfConsented,
} from "@/lib/mixpanel";

/**
 * UK PECR-compliant cookie consent banner.
 * - Analytics (Mixpanel) stays off until the user clicks "Accept".
 * - "Reject" is given equal prominence to "Accept" (no pre-selected option).
 * - The banner only appears until a choice is made; the choice is remembered.
 */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Re-enable analytics if the user accepted on a previous visit.
    initAnalyticsIfConsented();
    // Show the banner only if no choice has been made yet.
    if (getCookieConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    grantCookieConsent();
    setVisible(false);
  };

  const reject = () => {
    denyCookieConsent();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl bg-white border border-gray-200 shadow-lg rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm text-gray-600 leading-relaxed flex-1">
          We use essential cookies to run the site and, with your permission, analytics cookies
          (Mixpanel) to understand how it's used so we can improve it. You can accept or reject
          analytics — essential cookies are always on. See our{" "}
          <Link href="/privacypolicy" className="text-green-700 hover:underline font-medium">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={reject}
            className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={accept}
            className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
