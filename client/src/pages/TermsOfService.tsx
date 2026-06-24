import React from "react";
import { Link } from "wouter";

/**
 * Womble — Terms of Service (UK / England)
 *
 * NOTE FOR MAINTAINERS:
 * Items wrapped in [SQUARE BRACKETS] are placeholders that must be filled in
 * before this goes live. This document is drafted for a UK sole trader offering
 * a SaaS product to organisations and individuals. It is not a substitute for
 * legal advice — have it reviewed by a solicitor before relying on it.
 */

// ─── Fill these in ──────────────────────────────────────────────────────────
// Operating model: sole trader (Fred Burgess, trading as Womble).
// If you incorporate later, swap this block for company name + Companies House
// number + registered office, and update Section 1 accordingly.
const COMPANY = {
  proprietorName: "Fred Burgess",
  tradingName: "Womble",
  supportEmail: "womblefeedback@gmail.com",
  postalAddress: "available on request", // protects home address; provided on request
  websiteHost: "womblefeedback.com",
  lastUpdated: "24 June 2026",
};
// ────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({
  id,
  title,
  children,
}) => (
  <section id={id} className="scroll-mt-24">
    <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">{title}</h2>
    <div className="space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
  </section>
);

const TOC_ITEMS: { id: string; label: string }[] = [
  { id: "who-we-are", label: "1. Who we are and these terms" },
  { id: "definitions", label: "2. Definitions" },
  { id: "accounts", label: "3. Eligibility and your account" },
  { id: "licence", label: "4. Your right to use the Service" },
  { id: "acceptable-use", label: "5. Acceptable use" },
  { id: "your-content", label: "6. Your content" },
  { id: "learners", label: "7. Use with learners and your responsibilities" },
  { id: "ai", label: "8. AI-generated content" },
  { id: "our-ip", label: "9. Our intellectual property" },
  { id: "fees", label: "10. Fees and payment" },
  { id: "availability", label: "11. Availability, changes, and suspension" },
  { id: "privacy", label: "12. Privacy and data protection" },
  { id: "warranties", label: "13. Disclaimers" },
  { id: "liability", label: "14. Limitation of liability" },
  { id: "indemnity", label: "15. Your indemnity to us" },
  { id: "termination", label: "16. Termination" },
  { id: "changes", label: "17. Changes to these terms" },
  { id: "general", label: "18. General" },
  { id: "contact", label: "19. How to contact us" },
];

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/womble-icon.svg" alt="Womble" className="h-7 w-7" />
            <span className="text-xl font-bold text-gray-900">Womble</span>
          </Link>
          <Link href="/" className="text-sm text-green-600 hover:text-green-700 font-medium">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-6">Last updated: {COMPANY.lastUpdated}</p>

        <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-[15px] text-gray-700 leading-relaxed">
          These Terms of Service (“Terms”) govern your use of {COMPANY.tradingName}, the platform at{" "}
          {COMPANY.websiteHost} and related services (the “Service”), operated by{" "}
          {COMPANY.proprietorName}, trading as {COMPANY.tradingName} (“{COMPANY.tradingName}”, “we”,
          “us”, “our”). By creating an account or using the Service, you agree to these Terms. If you
          do not agree, you must not use the Service.
        </div>

        {/* Table of contents */}
        <nav className="mt-8 mb-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Contents
          </h2>
          <ol className="space-y-1.5 text-[15px]">
            {TOC_ITEMS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-green-700 hover:text-green-800 hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1. Who we are */}
        <Section id="who-we-are" title="1. Who we are and these terms">
          <p>
            The Service is operated by {COMPANY.proprietorName}, a sole trader established in England
            and trading as {COMPANY.tradingName}. Our postal contact address is{" "}
            {COMPANY.postalAddress}, and you can reach us at{" "}
            <a href={`mailto:${COMPANY.supportEmail}`} className="text-green-700 hover:underline">
              {COMPANY.supportEmail}
            </a>
            .
          </p>
          <p>
            These Terms form a legally binding agreement between you and us. They apply alongside our{" "}
            <Link href="/privacypolicy" className="text-green-700 hover:underline">
              Privacy Policy
            </Link>
            , which explains how we handle personal data. Where you enter into a separate written
            agreement with us (for example, an order form or data processing agreement), that
            agreement takes precedence over these Terms to the extent of any conflict.
          </p>
        </Section>

        {/* 2. Definitions */}
        <Section id="definitions" title="2. Definitions">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>“You” / “your”</strong> means the person or organisation that registers for or
              uses the Service.
            </li>
            <li>
              <strong>“Account holder”</strong> means a registered user who creates and manages
              activities — typically a trainer, administrator, or organisation.
            </li>
            <li>
              <strong>“Learner”</strong> means a person invited by an account holder to take part in
              an activity.
            </li>
            <li>
              <strong>“Your content”</strong> means the activities, prompts, instructions, reference
              materials, documents, and other material you upload or create using the Service.
            </li>
            <li>
              <strong>“Activity”</strong> means a learning interaction created in the Service, such
              as a conversation, quiz, teach-back, or document critique.
            </li>
          </ul>
        </Section>

        {/* 3. Accounts */}
        <Section id="accounts" title="3. Eligibility and your account">
          <p>
            You must be at least 18 years old and able to enter into a binding contract to register
            for an account. If you register on behalf of an organisation, you confirm that you have
            authority to bind that organisation to these Terms.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You are responsible for keeping your login credentials confidential.</li>
            <li>
              You are responsible for all activity that takes place under your account, whether or not
              authorised by you.
            </li>
            <li>You must provide accurate registration information and keep it up to date.</li>
            <li>
              You must notify us promptly at{" "}
              <a href={`mailto:${COMPANY.supportEmail}`} className="text-green-700 hover:underline">
                {COMPANY.supportEmail}
              </a>{" "}
              if you believe your account has been compromised.
            </li>
          </ul>
        </Section>

        {/* 4. Licence */}
        <Section id="licence" title="4. Your right to use the Service">
          <p>
            Subject to these Terms, we grant you a non-exclusive, non-transferable, revocable right to
            access and use the Service for your internal learning and training purposes. You must not
            resell, sub-license, or make the Service available to any third party except to learners
            you invite to take part in your activities.
          </p>
        </Section>

        {/* 5. Acceptable use */}
        <Section id="acceptable-use" title="5. Acceptable use">
          <p>You agree that you will not, and will not permit anyone else to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>use the Service for any unlawful, fraudulent, or harmful purpose;</li>
            <li>
              upload or generate content that is illegal, defamatory, obscene, harassing, hateful, or
              that infringes the rights of others;
            </li>
            <li>
              upload content you do not have the right to use, or that infringes any intellectual
              property, privacy, or other rights;
            </li>
            <li>
              attempt to gain unauthorised access to the Service, other accounts, or our systems, or
              interfere with or disrupt the Service;
            </li>
            <li>
              probe, scan, or test the vulnerability of the Service, or circumvent any security or
              usage limits;
            </li>
            <li>
              reverse engineer, decompile, or attempt to extract the source code of the Service,
              except to the extent the law does not allow this to be restricted;
            </li>
            <li>
              use the Service to build a competing product, or to train a machine-learning model; or
            </li>
            <li>
              use automated means to access the Service in a way that places an unreasonable load on
              our infrastructure.
            </li>
          </ul>
          <p>
            We may investigate and take action — including suspending or terminating accounts — in
            response to any suspected breach of this section.
          </p>
        </Section>

        {/* 6. Your content */}
        <Section id="your-content" title="6. Your content">
          <p>
            You retain all ownership rights in your content. You grant us a worldwide, royalty-free
            licence to host, store, process, transmit, and display your content solely to the extent
            necessary to provide and improve the Service to you, and to send it to the third-party AI
            and infrastructure providers described in our{" "}
            <Link href="/privacypolicy" className="text-green-700 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <p>
            You are solely responsible for your content and for ensuring you have all rights and
            permissions necessary to upload it and use it within the Service. We do not routinely
            monitor content, but we may remove content that we reasonably believe breaches these
            Terms or the law.
          </p>
        </Section>

        {/* 7. Learners */}
        <Section id="learners" title="7. Use with learners and your responsibilities">
          <p>
            Where you invite learners to take part in your activities, you are responsible for that
            use. In particular, you agree that:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              you will provide any privacy information to, and obtain any consents from, your learners
              that the law requires, and you act as the “controller” of their personal data (we act
              as your “processor” — see our Privacy Policy);
            </li>
            <li>
              you will not use the Service with children under 18 unless you have the necessary legal
              authority and consents to do so;
            </li>
            <li>
              you will not ask learners to submit special category data (such as health, religious, or
              biometric data) through the Service; and
            </li>
            <li>
              you are responsible for reviewing AI-generated feedback and scores before relying on
              them in relation to any learner.
            </li>
          </ul>
        </Section>

        {/* 8. AI */}
        <Section id="ai" title="8. AI-generated content">
          <p>
            The Service uses third-party artificial intelligence to generate responses, transcribe
            speech, and produce feedback and scores. AI output is produced automatically, may be
            inaccurate or incomplete, and should not be relied upon as professional, legal, medical,
            or other expert advice.
          </p>
          <p>
            You are responsible for reviewing AI-generated content before using it. AI feedback and
            scores are intended to support — not replace — human judgement, and should not be the sole
            basis for any significant decision about a person.
          </p>
        </Section>

        {/* 9. Our IP */}
        <Section id="our-ip" title="9. Our intellectual property">
          <p>
            The Service, including its software, design, branding, and all related intellectual
            property, belongs to us or our licensors. Except for the limited right to use the Service
            set out in these Terms, nothing grants you any right, title, or interest in the Service.
            You must not use our name, logo, or branding without our prior written consent.
          </p>
        </Section>

        {/* 10. Fees */}
        <Section id="fees" title="10. Fees and payment">
          <p>
            Some parts of the Service may be free, and others may require payment of fees. Where fees
            apply, they will be set out at the point of purchase or in a separate order form. Unless
            stated otherwise, fees are exclusive of VAT and are non-refundable except where required
            by law. We may change our fees on reasonable notice; changes will not affect a paid
            subscription period that is already running.
          </p>
        </Section>

        {/* 11. Availability */}
        <Section id="availability" title="11. Availability, changes, and suspension">
          <p>
            We aim to keep the Service available but do not guarantee that it will be uninterrupted or
            error-free. We may modify, suspend, or discontinue all or part of the Service, and may
            carry out maintenance, at any time. Where reasonably practicable, we will give notice of
            significant changes that adversely affect you.
          </p>
          <p>
            We may suspend or restrict your access to the Service immediately if we reasonably believe
            you are in breach of these Terms, or to protect the security or integrity of the Service.
          </p>
        </Section>

        {/* 12. Privacy */}
        <Section id="privacy" title="12. Privacy and data protection">
          <p>
            Our handling of personal data is described in our{" "}
            <Link href="/privacypolicy" className="text-green-700 hover:underline">
              Privacy Policy
            </Link>
            , which forms part of these Terms. Where we process learner personal data on your behalf,
            we do so as your processor, and the relevant data protection terms apply.
          </p>
        </Section>

        {/* 13. Disclaimers */}
        <Section id="warranties" title="13. Disclaimers">
          <p>
            The Service is provided “as is” and “as available”. To the fullest extent permitted by
            law, we exclude all warranties, conditions, and representations that are not expressly set
            out in these Terms, including any implied warranties of satisfactory quality, fitness for
            a particular purpose, and non-infringement. We do not warrant that the Service will meet
            your requirements or that AI output will be accurate or reliable.
          </p>
        </Section>

        {/* 14. Liability */}
        <Section id="liability" title="14. Limitation of liability">
          <p>
            Nothing in these Terms limits or excludes our liability where it would be unlawful to do
            so — including liability for death or personal injury caused by our negligence, for fraud
            or fraudulent misrepresentation, or for any other liability that cannot be limited or
            excluded under English law.
          </p>
          <p>Subject to that, to the fullest extent permitted by law:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              we are not liable for any loss of profits, loss of business, loss of goodwill, loss of
              data, or any indirect or consequential loss, however arising; and
            </li>
            <li>
              our total liability to you arising out of or in connection with these Terms and your use
              of the Service, whether in contract, tort (including negligence), or otherwise, is
              limited to the greater of (a) the total fees you paid to us in the 12 months before the
              event giving rise to the liability, or (b) £100.
            </li>
          </ul>
          <p>
            You are responsible for keeping your own copies of any content that is important to you.
          </p>
        </Section>

        {/* 15. Indemnity */}
        <Section id="indemnity" title="15. Your indemnity to us">
          <p>
            You agree to indemnify us against any losses, damages, costs, and reasonable expenses we
            suffer arising out of your breach of these Terms, your content, or your use of the Service
            in breach of the law or the rights of any third party.
          </p>
        </Section>

        {/* 16. Termination */}
        <Section id="termination" title="16. Termination">
          <p>
            You may stop using the Service and close your account at any time. We may suspend or
            terminate your access if you materially breach these Terms, or if we cease to provide the
            Service. On termination, your right to use the Service ends, and we may delete your
            content in accordance with our Privacy Policy and any applicable agreement. Any terms that
            by their nature should survive termination (such as those on intellectual property,
            liability, and indemnity) will continue to apply.
          </p>
        </Section>

        {/* 17. Changes */}
        <Section id="changes" title="17. Changes to these terms">
          <p>
            We may update these Terms from time to time. When we do, we will revise the “Last updated”
            date at the top of this page, and where changes are significant we will take reasonable
            steps to notify account holders. Your continued use of the Service after changes take
            effect constitutes acceptance of the updated Terms.
          </p>
        </Section>

        {/* 18. General */}
        <Section id="general" title="18. General">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Entire agreement.</strong> These Terms, together with our Privacy Policy and any
              separate written agreement, form the entire agreement between us.
            </li>
            <li>
              <strong>Assignment.</strong> You may not transfer your rights under these Terms without
              our consent. We may transfer ours in connection with a reorganisation or business sale.
            </li>
            <li>
              <strong>Severability.</strong> If any part of these Terms is found to be unenforceable,
              the rest will continue to apply.
            </li>
            <li>
              <strong>No waiver.</strong> A delay in enforcing these Terms is not a waiver of our
              rights.
            </li>
            <li>
              <strong>Third parties.</strong> No one other than you and us has any rights under these
              Terms.
            </li>
            <li>
              <strong>Governing law.</strong> These Terms are governed by the laws of England and
              Wales, and the courts of England and Wales have exclusive jurisdiction over any dispute.
            </li>
          </ul>
        </Section>

        {/* 19. Contact */}
        <Section id="contact" title="19. How to contact us">
          <p>If you have any questions about these Terms, please contact us:</p>
          <ul className="list-none pl-0 space-y-1">
            <li>
              <strong>Email:</strong>{" "}
              <a href={`mailto:${COMPANY.supportEmail}`} className="text-green-700 hover:underline">
                {COMPANY.supportEmail}
              </a>
            </li>
            <li>
              <strong>Post:</strong> {COMPANY.proprietorName} (trading as {COMPANY.tradingName}) —
              postal address {COMPANY.postalAddress}
            </li>
          </ul>
        </Section>

        <div className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-400">
          © {new Date().getFullYear()} {COMPANY.proprietorName}, trading as {COMPANY.tradingName}. All
          rights reserved.
        </div>
      </main>
    </div>
  );
}
