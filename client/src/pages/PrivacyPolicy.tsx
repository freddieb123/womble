import React from "react";
import { Link } from "wouter";

/**
 * Womble — Privacy Policy (UK / England)
 *
 * NOTE FOR MAINTAINERS:
 * Items wrapped in [SQUARE BRACKETS] are placeholders that must be filled in
 * with your real company details before this goes live. See the list at the
 * top of the component. This document is drafted to align with the UK GDPR and
 * the Data Protection Act 2018. It is not a substitute for legal advice — have
 * it reviewed by a solicitor before publishing.
 */

// ─── Fill these in ──────────────────────────────────────────────────────────
// Operating model: sole trader (Fred Burgess, trading as Womble).
// If you incorporate later, swap this block for company name + Companies House
// number + registered office, and update Section 1 and Section 15 accordingly.
const COMPANY = {
  proprietorName: "Fred Burgess",
  tradingName: "Womble",
  icoNumber: "[ICO REGISTRATION NUMBER]", // register at ico.org.uk and drop the number in
  privacyEmail: "womblefeedback@gmail.com",
  postalAddress: "available on request", // protects home address; provided to data subjects on request
  websiteHost: "womblefeedback.com",
  lastUpdated: "22 June 2026",
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
  { id: "who-we-are", label: "1. Who we are" },
  { id: "roles", label: "2. Our role: controller and processor" },
  { id: "data-we-collect", label: "3. The personal data we collect" },
  { id: "how-we-use", label: "4. How and why we use your data" },
  { id: "lawful-basis", label: "5. Our lawful bases for processing" },
  { id: "ai", label: "6. Artificial intelligence and your content" },
  { id: "sub-processors", label: "7. Who we share data with (sub-processors)" },
  { id: "transfers", label: "8. International data transfers" },
  { id: "retention", label: "9. How long we keep your data" },
  { id: "security", label: "10. How we keep data secure" },
  { id: "your-rights", label: "11. Your rights" },
  { id: "cookies", label: "12. Cookies and analytics" },
  { id: "children", label: "13. Children's data" },
  { id: "changes", label: "14. Changes to this policy" },
  { id: "contact", label: "15. How to contact us & complain" },
];

export default function PrivacyPolicy() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-6">Last updated: {COMPANY.lastUpdated}</p>

        <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-[15px] text-gray-700 leading-relaxed">
          This policy explains how {COMPANY.proprietorName}, trading as {COMPANY.tradingName} (“
          {COMPANY.tradingName}”, “we”, “us”, “our”), collects, uses, and protects personal data when
          you use our platform at {COMPANY.websiteHost} and related services (the “Service”). We are
          committed to handling
          personal data in line with the UK General Data Protection Regulation (“UK GDPR”) and the
          Data Protection Act 2018.
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
        <Section id="who-we-are" title="1. Who we are">
          <p>
            {COMPANY.tradingName} is operated by {COMPANY.proprietorName}, a sole trader established
            in England and trading as {COMPANY.tradingName}. Our postal contact address is{" "}
            {COMPANY.postalAddress}.
          </p>
          <p>
            We are registered with the Information Commissioner's Office (“ICO”), the UK's data
            protection regulator, under registration number {COMPANY.icoNumber}.
          </p>
          <p>
            For any questions about this policy or how we handle personal data, you can reach us at{" "}
            <a href={`mailto:${COMPANY.privacyEmail}`} className="text-green-700 hover:underline">
              {COMPANY.privacyEmail}
            </a>
            .
          </p>
        </Section>

        {/* 2. Roles */}
        <Section id="roles" title="2. Our role: controller and processor">
          <p>
            Womble is sold to organisations (such as training providers, colleges, and employers)
            who use it to run learning activities for their learners. Under data protection law, our
            role depends on whose data is involved:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Learner data — we act as a “processor”.</strong> When a business customer sets
              up activities and invites learners to take part, that customer determines why and how
              the learners' personal data is used. The customer is the “controller”, and Womble
              processes that data <em>on their behalf and under their instructions</em>. This
              includes the conversations, voice recordings, quiz answers, and AI-generated feedback
              created during activities. Our processing of this data is governed by our agreement
              (including any Data Processing Agreement) with the customer.
            </li>
            <li>
              <strong>Account and account-holder data — we act as a “controller”.</strong> For the
              administrators, trainers, and other staff who register for and manage a Womble account,
              and for visitors to our website, we decide how that personal data is used. For this
              data, we are the controller and this policy applies directly.
            </li>
          </ul>
          <p>
            If you are a learner and have questions about how your data is used, please contact the
            organisation that invited you to use Womble in the first instance — they are the
            controller of your data. We will support them in responding to your request.
          </p>
        </Section>

        {/* 3. Data we collect */}
        <Section id="data-we-collect" title="3. The personal data we collect">
          <p>We collect and process the following categories of personal data:</p>
          <h3 className="font-semibold text-gray-900 mt-4">Account holders (we are controller)</h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account details</strong> — your name, email address, and password (stored in
              hashed form). If you sign in via Google or Microsoft, we receive your name and email
              address from those providers.
            </li>
            <li>
              <strong>Content you create</strong> — the activities, prompts, instructions, reference
              materials, and feedback criteria you configure.
            </li>
            <li>
              <strong>Usage and technical data</strong> — log data, IP address, device and browser
              information, and how you interact with the Service.
            </li>
          </ul>
          <h3 className="font-semibold text-gray-900 mt-4">Learners (we are processor)</h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Identifier</strong> — the name (or display name) a learner enters to take part
              in an activity.
            </li>
            <li>
              <strong>Activity content</strong> — typed messages, voice recordings and their
              transcripts, quiz answers, document observations, and other contributions made during
              an activity.
            </li>
            <li>
              <strong>AI-generated feedback and scores</strong> — the assessment, feedback, and
              scores produced in response to a learner's contributions.
            </li>
            <li>
              <strong>Technical data</strong> — session identifiers and basic technical information
              needed to deliver the activity.
            </li>
          </ul>
          <p className="text-sm text-gray-500">
            We do not deliberately collect special category data (such as health, religion, or
            ethnicity). Learners should not be asked to share such information through the Service.
          </p>
        </Section>

        {/* 4. How we use */}
        <Section id="how-we-use" title="4. How and why we use your data">
          <p>We use personal data to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>provide, operate, and maintain the Service and learning activities;</li>
            <li>create accounts and authenticate users;</li>
            <li>
              generate AI responses, transcribe voice recordings, and produce feedback and scores
              during activities;
            </li>
            <li>give trainers and administrators visibility of learner submissions and results;</li>
            <li>provide customer support and respond to enquiries;</li>
            <li>
              understand how the Service is used so we can improve it, fix problems, and develop new
              features;
            </li>
            <li>keep the Service secure and prevent fraud or misuse; and</li>
            <li>comply with our legal and regulatory obligations.</li>
          </ul>
        </Section>

        {/* 5. Lawful bases */}
        <Section id="lawful-basis" title="5. Our lawful bases for processing">
          <p>
            Where we are the controller, we rely on the following lawful bases under Article 6 of the
            UK GDPR:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Contract</strong> — to provide the Service to account holders and fulfil our
              agreement with them.
            </li>
            <li>
              <strong>Legitimate interests</strong> — to operate, secure, analyse, and improve the
              Service, provided this is not overridden by your interests or rights. You can object to
              this processing (see “Your rights”).
            </li>
            <li>
              <strong>Legal obligation</strong> — where we must process data to comply with the law.
            </li>
            <li>
              <strong>Consent</strong> — where we ask for it specifically, for example for certain
              optional analytics cookies. You can withdraw consent at any time.
            </li>
          </ul>
          <p>
            Where we act as a processor for learner data, the relevant lawful basis is determined by
            our business customer as the controller.
          </p>
        </Section>

        {/* 6. AI */}
        <Section id="ai" title="6. Artificial intelligence and your content">
          <p>
            Womble uses third-party AI services to power its activities — for example, to generate an
            AI character's responses, transcribe speech to text, and produce feedback. To do this, the
            content of an activity (such as messages, voice recordings, and the activity's
            instructions) is sent to our AI providers for processing.
          </p>
          <p>
            We use these providers' standard business and API services. Under the terms applicable to
            those services, your content is <strong>not</strong> used to train the providers' general
            AI models. Content is processed only to return a result to you. See “Who we share data
            with” below for the providers involved.
          </p>
          <p>
            AI-generated feedback and scores are intended to support learning and are produced
            automatically. They may contain errors and should be reviewed by a human (such as a
            trainer) rather than relied on as the sole basis for any significant decision about a
            person.
          </p>
        </Section>

        {/* 7. Sub-processors */}
        <Section id="sub-processors" title="7. Who we share data with (sub-processors)">
          <p>
            We do not sell personal data. We share it only with trusted service providers who help us
            run the Service, and only as far as needed. Our key sub-processors are:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg mt-2">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 border-b border-gray-200">
                    Provider
                  </th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-gray-200">
                    Purpose
                  </th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-gray-200">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ["OpenAI", "AI responses, speech transcription, and feedback generation", "USA"],
                  ["Railway", "Cloud hosting and database infrastructure", "USA / EU"],
                  ["Google", "Optional single sign-on (Google login)", "USA / EU"],
                  ["Microsoft", "Optional single sign-on (Microsoft login)", "USA / EU"],
                  ["Mixpanel", "Product analytics (how the Service is used)", "USA / EU"],
                ].map(([name, purpose, loc]) => (
                  <tr key={name} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2">{purpose}</td>
                    <td className="px-3 py-2">{loc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            We may also disclose personal data where required by law, to enforce our terms, or in
            connection with a business sale or reorganisation. An up-to-date list of sub-processors is
            available to business customers on request.
          </p>
        </Section>

        {/* 8. Transfers */}
        <Section id="transfers" title="8. International data transfers">
          <p>
            Some of our providers are based in, or store data in, countries outside the UK — including
            the United States. Where we transfer personal data outside the UK, we make sure it is
            protected by an appropriate safeguard recognised under UK data protection law, such as:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>the UK's International Data Transfer Agreement (IDTA);</li>
            <li>
              the UK Addendum to the EU Standard Contractual Clauses (SCCs); or
            </li>
            <li>
              transfers to providers certified under the UK Extension to the EU–US Data Privacy
              Framework, where applicable.
            </li>
          </ul>
          <p>
            You can request more information about these safeguards by contacting us at{" "}
            <a href={`mailto:${COMPANY.privacyEmail}`} className="text-green-700 hover:underline">
              {COMPANY.privacyEmail}
            </a>
            .
          </p>
        </Section>

        {/* 9. Retention */}
        <Section id="retention" title="9. How long we keep your data">
          <p>
            We keep personal data only for as long as we need it for the purposes set out in this
            policy.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account holder data</strong> is kept while the account is active and for a
              reasonable period afterwards to meet our legal, accounting, and security obligations.
            </li>
            <li>
              <strong>Learner data</strong> is retained for as long as the relevant business
              customer's account remains active. We delete or return it when the customer asks us to,
              or within a reasonable period after their account is closed, subject to the customer's
              instructions and any legal requirement to retain it.
            </li>
          </ul>
          <p>
            Business customers can request deletion of specific learner data at any time. When data is
            no longer needed, we securely delete or anonymise it.
          </p>
        </Section>

        {/* 10. Security */}
        <Section id="security" title="10. How we keep data secure">
          <p>
            We take appropriate technical and organisational measures to protect personal data against
            unauthorised access, loss, or misuse. These include encryption of data in transit,
            hashing of passwords, access controls, and use of reputable infrastructure providers. No
            online service can be completely secure, but we work to protect your data and will notify
            you and the ICO of any breach where we are legally required to do so.
          </p>
        </Section>

        {/* 11. Rights */}
        <Section id="your-rights" title="11. Your rights">
          <p>Under the UK GDPR you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>be informed about how your data is used (this policy);</li>
            <li>access a copy of the personal data we hold about you;</li>
            <li>have inaccurate data corrected;</li>
            <li>have your data erased in certain circumstances;</li>
            <li>restrict or object to certain processing;</li>
            <li>data portability (receive your data in a usable format); and</li>
            <li>withdraw consent where we rely on it.</li>
          </ul>
          <p>
            If we are the controller of your data (for example, you are an account holder), contact us
            using the details below and we will respond within one month. If you are a learner, please
            direct your request to the organisation that invited you to use Womble, as they are the
            controller of your data; we will assist them in fulfilling it.
          </p>
        </Section>

        {/* 12. Cookies */}
        <Section id="cookies" title="12. Cookies and analytics">
          <p>We use a small number of cookies and similar technologies:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Essential cookies</strong> — necessary to sign you in, keep you signed in, and
              run the Service securely. These cannot be switched off.
            </li>
            <li>
              <strong>Analytics</strong> — we use Mixpanel to understand how the Service is used (for
              example, which features are popular) so we can improve it. This data is used in an
              aggregated and pseudonymised way wherever possible.
            </li>
          </ul>
          <p>
            We do not use advertising or third-party marketing tracking cookies. You can control
            cookies through your browser settings, though blocking essential cookies may stop parts of
            the Service from working.
          </p>
        </Section>

        {/* 13. Children */}
        <Section id="children" title="13. Children's data">
          <p>
            Womble is designed for use in workplace and adult learning contexts and is not directed at
            children. Where a business customer uses Womble with learners under the age of 18, that
            customer is responsible, as controller, for obtaining any necessary consents and for
            ensuring its use complies with the law. If you believe a child's data has been provided to
            us without appropriate authority, please contact us so we can address it.
          </p>
        </Section>

        {/* 14. Changes */}
        <Section id="changes" title="14. Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we will revise the “Last updated”
            date at the top of this page. Where changes are significant, we will take reasonable steps
            to notify account holders.
          </p>
        </Section>

        {/* 15. Contact */}
        <Section id="contact" title="15. How to contact us & complain">
          <p>
            If you have any questions, requests, or concerns about this policy or your personal data,
            please contact us:
          </p>
          <ul className="list-none pl-0 space-y-1">
            <li>
              <strong>Email:</strong>{" "}
              <a href={`mailto:${COMPANY.privacyEmail}`} className="text-green-700 hover:underline">
                {COMPANY.privacyEmail}
              </a>
            </li>
            <li>
              <strong>Post:</strong> {COMPANY.proprietorName} (trading as {COMPANY.tradingName}) —
              postal address {COMPANY.postalAddress}
            </li>
          </ul>
          <p>
            You also have the right to lodge a complaint with the Information Commissioner's Office
            (ICO) if you are unhappy with how we have handled your data. We would, however, appreciate
            the chance to address your concerns first.
          </p>
          <ul className="list-none pl-0 space-y-1">
            <li>
              <strong>Information Commissioner's Office</strong>
            </li>
            <li>Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</li>
            <li>
              Helpline: 0303 123 1113 &nbsp;|&nbsp;{" "}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 hover:underline"
              >
                ico.org.uk
              </a>
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
