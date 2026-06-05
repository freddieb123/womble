import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useAuth } from "@/hooks/use-auth";
import { track, EventName } from "@/lib/mixpanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowRight, CheckCircle2, Layers, MessageCircle, Users,
  GraduationCap, Wand2, Sparkles, Copy, Trophy,
  BarChart3, Tag, Check, MessageCircleQuestion, Plus, Mail,
} from "lucide-react";
import "./LandingPage.css";

const ROTATING_WORDS = ['workshop', 'lecture', 'lesson'];

export default function LandingPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [wordIndex, setWordIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const initial = setTimeout(() => {
      interval = setInterval(() => {
        setAnimating(true);
        setTimeout(() => {
          setWordIndex(i => (i + 1) % ROTATING_WORDS.length);
          setAnimating(false);
        }, 300);
      }, 3000);
    }, 2000);
    return () => {
      clearTimeout(initial);
      if (interval) clearInterval(interval);
    };
  }, []);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const goRegister = (location: string) => {
    track(EventName.LANDING_GET_STARTED_CLICK, { location });
    window.location.href = "/auth?mode=register";
  };

  const goLogin = () => {
    track(EventName.LANDING_LOGIN_CLICK, { location: "navbar" });
    window.location.href = "/auth?mode=login";
  };

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Womble",
    applicationCategory: "EducationalApplication",
    offers: { "@type": "Offer", price: "8.00", priceCurrency: "GBP" },
    description: "Womble provides bespoke formative feedback for education and training through AI-powered activities.",
    operatingSystem: "Web",
  };

  return (
    <div className="lp">
      <Helmet>
        <title>Womble — Every participant gets expert feedback. Instantly.</title>
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="container lp-nav-inner">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span className="lp-logo" style={{ cursor: "pointer" }}>
                <img src="/womble-icon.svg" alt="Womble" />
                <span className="lp-wordmark">Womble</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-3">
              <div className="space-y-2">
                <h4 className="font-bold">Womble</h4>
                <p className="text-sm">
                  <span className="italic text-muted-foreground">noun</span><br />
                  A fictional animal inhabiting Wimbledon Common in London, characterised as clearing up litter.
                </p>
                <p className="text-sm">
                  <span className="italic text-muted-foreground">verb (informal)</span><br />
                  Wander in a casual or relaxed way.<br />
                  <span className="italic">"once we'd arrived back in Cambridge, we wombled quietly home"</span>
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="lp-nav-links">
            <a href="#activities">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="lp-nav-spacer" />
          <div className="lp-cta-group">
            <button className="btn btn-ghost" onClick={goLogin}>Log in</button>
            <button className="btn btn-primary" onClick={() => goRegister("navbar")}>Start for free</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" /> AI-powered experiences for your learners</span>
          <h1>
            Bespoke feedback for everyone<br />
            in your{" "}
            <span className={`accent rotating-word${animating ? ' rotating-word--exit' : ''}`}>
              {ROTATING_WORDS[wordIndex]}
            </span>
          </h1>
          <p className="lead">
            Create AI-powered practice activities in minutes. Share a link. Your participants get bespoke feedback and you get insights to adapt your session on the fly.
          </p>
          <div className="ctas">
            <button className="btn btn-primary lg" onClick={() => goRegister("hero")}>
              Start for free <ArrowRight size={18} />
            </button>
            <a className="btn btn-outline lg" href="#how">See how it works</a>
          </div>
          <div className="trust">
            <span><CheckCircle2 size={16} className="icon" /> No credit card required</span>
            <span><CheckCircle2 size={16} className="icon" /> Free to start</span>
            <span><CheckCircle2 size={16} className="icon" /> No login for participants</span>
          </div>
        </div>
      </section>

      {/* ── Activity Types ───────────────────────────────────── */}
      <section id="activities">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow"><Layers size={14} style={{ display: "inline" }} /> The core product</span>
            <h2>Four ways to run AI-powered practice</h2>
            <p className="sub">Pick the shape that fits the moment. Every activity gives every participant their own bespoke feedback.</p>
          </div>

          <div className="activity-grid">
            {/* Chat with AI */}
            <div className="activity-card tone-chat">
              <div className="preview">
                <span className="meta-tag">Roleplay · typed or voice</span>
                <span className="speaker">AI · sceptical procurement manager</span>
                <span className="bubble">"What's your best price on a 12-month deal?"</span>
                <span className="bubble right">"Before we get to numbers, can I understand what's driving the timing?"</span>
                <span className="bubble">"Mm. I've heard that one before."</span>
              </div>
              <div className="info">
                <div className="head">
                  <div className="icon-chip"><MessageCircle size={18} /></div>
                  <h3>Chat with AI</h3>
                </div>
                <p>Participants have a typed or voice conversation with an AI playing a custom role you define. Sales practice, customer service, difficult conversations.</p>
              </div>
            </div>

            {/* Two-way conversation */}
            <div className="activity-card tone-conversation">
              <div className="preview">
                <span className="meta-tag">Pair work · recorded</span>
                <div className="row">
                  <span className="who">Sam:</span>
                  <span className="bubble">"How would you handle a missed deadline with this client?"</span>
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <span className="bubble right">"I'd own it first — say what happened, what I'd change next time."</span>
                  <span className="who" style={{ textAlign: "right" }}>Alex:</span>
                </div>
                <div className="row">
                  <span className="who">Sam:</span>
                  <span className="bubble">"What would you say first, exactly?"</span>
                </div>
                <span className="rec">
                  <span className="rec-dot" /> Recording · Womble listening
                </span>
              </div>
              <div className="info">
                <div className="head">
                  <div className="icon-chip"><Users size={18} /></div>
                  <h3>Two-way conversation</h3>
                </div>
                <p>Two participants have a real conversation while Womble records it. AI analyses both sides and gives each person feedback.</p>
              </div>
            </div>

            {/* Teach an AI */}
            <div className="activity-card tone-teach">
              <div className="preview">
                <span className="meta-tag">Learn-by-teaching</span>
                <span className="speaker">AI · curious beginner</span>
                <span className="bubble">"So RICE stands for Reach, Impact, Confidence and Effort."</span>
                <span className="bubble right">"Great and how would you suggest using it?"</span>
                <span className="bubble">"Well let's think through a particular context..."</span>
              </div>
              <div className="info">
                <div className="head">
                  <div className="icon-chip"><GraduationCap size={18} /></div>
                  <h3>Teach an AI</h3>
                </div>
                <p>Participants explain a topic to an AI set at a specific knowledge level. The AI asks questions rather than giving answers. Your participants have to do the teaching.</p>
              </div>
            </div>

            {/* Thought Partner */}
            <div className="activity-card tone-thought">
              <div className="preview">
                <span className="meta-tag">Apply · open-ended</span>
                <span className="speaker">AI · thought partner</span>
                <span className="bubble">"How would I apply active listening with my remote team?"</span>
                <span className="bubble right">"Well let's talk it through. Give me a summary of the regular weekly meetings you have. We'll step through each one."</span>
                <span className="bubble">"OK well we have a team meeting every Wednesday and I sometimes find it's a little one-way..."</span>
              </div>
              <div className="info">
                <div className="head">
                  <div className="icon-chip">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 4 Q 4 4 4 6 L 4 14 Q 4 16 6 16 L 9 16 L 11 19 L 13 16 L 18 16 Q 20 16 20 14 L 20 6 Q 20 4 18 4 Z" />
                      <circle cx="9" cy="10" r="0.6" fill="currentColor" />
                      <circle cx="12" cy="10" r="0.6" fill="currentColor" />
                      <circle cx="15" cy="10" r="0.6" fill="currentColor" />
                    </svg>
                  </div>
                  <h3>Thought Partner</h3>
                </div>
                <p>An AI that helps participants think through how to apply a concept in their own context. It asks probing questions, surfaces blind spots — they find their own answer.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────── */}
      <section id="how" className="how-bg">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow"><Wand2 size={14} style={{ display: "inline" }} /> Set up in 90 seconds</span>
            <h2>From idea to feedback in four steps</h2>
            <p className="sub">Describe it. Share a link. Run it live. Everyone walks out with feedback.</p>
          </div>

          <div className="how-grid">
            {/* Step 1 */}
            <div className="how-card">
              <span className="step-num">1</span>
              <h3>Describe your activity</h3>
              <p>Type what you want in plain English. AI builds it in seconds. Tweak the role, tone, knowledge level, feedback criteria. Full control.</p>
              <div className="visual visual-prompt">
                <div className="input">a negotiation roleplay where the AI plays a sceptical procurement manager pushing on price</div>
                <div className="build-btn"><Sparkles style={{ width: 11, height: 11 }} /> Build activity</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="how-card">
              <span className="step-num">2</span>
              <h3>Share a link</h3>
              <p>One link in the chat. No logins or app downloads needed for participants. Works typed or as a live voice conversation.</p>
              <div className="visual visual-link">
                <div className="link-pill">womble.co/p/neg-prc-9k2x</div>
                <span className="copy"><Copy style={{ width: 11, height: 11 }} /> Copy</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="how-card">
              <span className="step-num">3</span>
              <h3>Participants do the activity</h3>
              <p>Everyone joins in — typed or spoken. A live leaderboard keeps the room engaged and shows you who's flying and who's stuck.</p>
              <div className="visual visual-leaderboard">
                <div className="lb-h"><Trophy style={{ width: 11, height: 11 }} /> Live leaderboard</div>
                {[
                  { pos: "1", initial: "M", name: "Maya", color: "#16A34A", dots: [1,1,1,1,1] },
                  { pos: "2", initial: "S", name: "Sam",  color: "#2563EB", dots: [1,1,1,1,0] },
                  { pos: "3", initial: "A", name: "Alex", color: "#9333EA", dots: [1,1,1,0,0] },
                  { pos: "4", initial: "J", name: "Jo",   color: "#F97316", dots: [1,1,0,0,0], faint: true },
                ].map(({ pos, initial, name, color, dots, faint }) => (
                  <div className="lb-row" key={name} style={faint ? { opacity: 0.55 } : undefined}>
                    <span className="pos">{pos}</span>
                    <span className="av" style={{ background: color }}>{initial}</span>
                    <span className="name">{name}</span>
                    <span className="score">{dots.map((on, i) => <i key={i} className={on ? "on" : undefined} />)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 4 */}
            <div className="how-card">
              <span className="step-num">4</span>
              <h3>Everyone gets feedback</h3>
              <p>Participants see personalised AI feedback instantly. You get a class-level summary so you know what to revisit before moving on.</p>
              <div className="visual visual-dash">
                <div className="dash-label"><BarChart3 style={{ width: 11, height: 11 }} /> Class summary</div>
                {[
                  { label: "Interests", pct: 75,  count: "9/12", orange: false },
                  { label: "BATNA",     pct: 33,  count: "4/12", orange: true  },
                  { label: "Criteria",  pct: 58,  count: "7/12", orange: false },
                  { label: "Options",   pct: 42,  count: "5/12", orange: false },
                ].map(({ label, pct, count, orange }) => (
                  <div className="dash-row" key={label}>
                    <span style={{ width: 60, fontSize: 11 }}>{label}</span>
                    <span className="bar"><i style={{ width: `${pct}%`, background: orange ? "#F97316" : undefined }} /></span>
                    <span className="dash-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="pricing-bg">
        <div className="container-narrow">
          <div className="section-head">
            <span className="eyebrow"><Tag size={14} style={{ display: "inline" }} /> Simple, fair pricing</span>
            <h2>Pricing for small budgets</h2>
            <p className="sub">Made by teachers — priced like it.</p>
          </div>

          <div className="pricing-grid">
            {/* Free */}
            <div className="price-card no-offer">
              <h3>Free</h3>
              <div className="sub-tier">For occasional use</div>
              <div className="price-row">
                <span className="price">£0</span>
                <span className="per">forever</span>
              </div>
              <ul>
                {["Up to 2 activities", "Unlimited responses", "Personalised feedback for participants", "Basic class summary"].map(f => (
                  <li key={f}><Check size={18} className="li-check" /><span>{f}</span></li>
                ))}
              </ul>
              <button className="btn btn-outline" onClick={() => { track(EventName.PRICING_BUTTON_CLICK, { plan: "free", location: "pricing_section" }); window.location.href = "/auth?mode=register"; }}>
                Get started
              </button>
            </div>

            {/* Pro */}
            <div className="price-card featured">
              <span className="pop-badge">★ Most popular</span>
              <h3>Pro</h3>
              <div className="sub-tier">For active trainers</div>
              <div className="price-row">
                <span className="price">£8</span>
                <span className="per">/ month</span>
                <span className="strike">£15</span>
              </div>
              <div className="offer-line"><span className="badge">Limited time</span> save 47%</div>
              <ul>
                {["Unlimited activities", "Full class analytics", "Custom feedback criteria", "Voice + typed modes", "Priority support"].map(f => (
                  <li key={f}><Check size={18} className="li-check" /><span>{f}</span></li>
                ))}
              </ul>
              <button className="btn btn-primary" onClick={() => { track(EventName.PRICING_BUTTON_CLICK, { plan: "pro", location: "pricing_section" }); window.location.href = "/auth?mode=register"; }}>
                Start free trial
              </button>
            </div>

            {/* Enterprise */}
            <div className="price-card no-offer">
              <h3>Enterprise</h3>
              <div className="sub-tier">For organisations</div>
              <div className="price-row">
                <span className="price">Custom</span>
              </div>
              <ul>
                {["Everything in Pro", "Team-shared activities", "Dedicated support", "SSO & compliance", "Custom onboarding"].map(f => (
                  <li key={f}><Check size={18} className="li-check" /><span>{f}</span></li>
                ))}
              </ul>
              <button className="btn btn-outline" onClick={() => { track(EventName.PRICING_BUTTON_CLICK, { plan: "enterprise", location: "pricing_section" }); window.location.href = "mailto:womblefeedback@gmail.com"; }}>
                Contact sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="faq-bg">
        <div className="container">
          <div className="faq-wrap">
            <div className="faq-side">
              <span className="eyebrow"><MessageCircleQuestion size={14} style={{ display: "inline" }} /> Questions, answered</span>
              <h2 style={{ marginTop: 16 }}>Things trainers ask before they sign up</h2>
              <p>Built by teachers who've stood at the front of the room. If your question isn't here, ask us — we answer every email personally.</p>
              <a className="contact" href="mailto:womblefeedback@gmail.com">
                <Mail size={14} /> womblefeedback@gmail.com
              </a>
            </div>

            <div className="faq-list">
              {[
                {
                  q: "Do my participants need to sign up or download anything?",
                  a: "No. You share a link, they click it, they're in. Works on any phone or laptop, in the browser. No accounts, no installs, no friction. They can pick a name and go.",
                  open: true,
                },
                {
                  q: "How long does it take to build an activity?",
                  a: "Most trainers have a first activity running in under 90 seconds. Type a sentence describing what you want and the AI drafts the role, the brief and the feedback criteria. You tweak whatever doesn't sound like you, then share the link.",
                },
                {
                  q: "Is the feedback actually any good?",
                  a: "It's grounded in the criteria you set. You can paste in your own marking rubric or edit what the AI suggests. Womble grades against that, not against a generic notion of 'good'. Most trainers iterate on the criteria once or twice in the first week and then trust it.",
                },
                {
                  q: "What happens to my participants' data?",
                  a: "Conversations are stored in your account so you can review them later. Participants see their own; you see your class. We don't train on your data, and we don't share it apart from data through the Open AI API but nothing identifiable apart from the name they choose to share. Full deletion on request.",
                },
                {
                  q: "How well does voice mode actually work?",
                  a: "Low-latency, natural. Honestly, the new Open AI Realtime API is excellent. Give it a go — it's free!",
                },
                {
                  q: "Can I share activities with my team?",
                  a: "Yes on Pro (one-way shareable links to your activity templates) and on Enterprise (a proper shared library with permissions and a brand layer). On Free you can run as many sessions as you like — just two activity templates at a time.",
                },
              ].map(({ q, a, open }) => (
                <details key={q} className="faq-item" open={open}>
                  <summary>
                    {q}
                    <span className="plus"><Plus size={16} /></span>
                  </summary>
                  <div className="answer">{a}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────── */}
      <section className="cta-banner">
        <div className="container">
          <h2>Ready to give every participant the feedback they deserve?</h2>
          <p>Set up your first activity in under a minute. No credit card. No app for participants.</p>
          <div className="ctas">
            <button className="btn btn-on-green lg" onClick={() => goRegister("cta_banner")}>
              Start for free <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="container">
          <div className="grid">
            <div>
              <div className="footer-logo">
                <img src="/womble-icon.svg" alt="Womble" />
                <span className="footer-wordmark">Womble</span>
              </div>
              <p className="tag">Timely, bespoke feedback. Built by teachers, for teachers.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#activities">Features</a></li>
                <li><a href="#how">How it works</a></li>
                <li><a href="#pricing">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4>Activity types</h4>
              <ul>
                <li><a href="#activities">Chat with AI</a></li>
                <li><a href="#activities">Two-way conversation</a></li>
                <li><a href="#activities">Teach an AI</a></li>
                <li><a href="#activities">Thought Partner</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href="mailto:womblefeedback@gmail.com">Contact us</a></li>
              </ul>
            </div>
          </div>
          <div className="bottom">Made with ❤️ by Uncle Bulgaria.</div>
        </div>
      </footer>
    </div>
  );
}
