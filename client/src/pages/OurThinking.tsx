import React from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet";

const POST = {
  title: "Being Everywhere, All at Once",
  readingTime: "2 mins - or one espresso ☕",
};

export default function OurThinking() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>{POST.title} — Womble</title>
        <meta
          name="description"
          content="Why structured, bespoke feedback is the key ingredient for learning — and how AI can enhance rather than replace it."
        />
      </Helmet>

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
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Our thinking
        </span>
        <h1 className="text-3xl font-bold text-gray-900 mt-2 mb-2">{POST.title}</h1>
        <p className="text-sm text-gray-500 mb-8">{POST.readingTime}</p>

        <article className="space-y-4 text-[17px] leading-relaxed text-gray-700">
          <p>
            What follows is some thoughts on an important ingredient for learning: feedback.
          </p>
          <p>
            We know that structured feedback is critical to learning. When an airline pilot sits in a
            simulator and they attempt to land and instead they crash they’ve got very clear
            feedback. When you try standup comedy and all you get is a silent room, that’s very clear
            feedback.
          </p>
          <p>
            In both cases the feedback comes from the situation, but probably also from someone — the
            flying instructor or a friend watching the standup. In both cases you’ll change your
            approach next time — you’ll learn.
          </p>
          <p>
            Our belief at Womble is that we need to create experiences in our teaching sessions and
            ensure people get bespoke feedback on how they performed in that experience. Whether
            that’s a negotiation on a contract, practising a user testing conversation or a team kick
            off meeting. By simulating and getting feedback, you’re in a good position to learn.
          </p>
          <p>
            It makes sense but it’s a hard thing to do. Getting specific feedback to every participant
            regularly is time consuming and often feels impossible to actually do as a teacher.
            Particularly when the task is nuanced like a negotiation — you need to listen to the whole
            conversation. As teachers, we can’t be everywhere, all at once.
          </p>
          <p>
            There’s a real opportunity for AI to enhance learning in this respect. In a business
            context, we are often trying to replace our thinking by using AI. But we cannot afford to
            do this whilst learning. Because by definition if we are replacing our thinking we are not
            learning. We have a real opportunity to enhance rather than replace our learning and tools
            like Womble can help facilitate that.
          </p>
          <p>
            Womble allows you to build highly considered activities that give people the chance to
            practice and get bespoke feedback — both for the learner and the teacher to see. Plus what
            about this key question:
          </p>
          <p className="text-xl font-semibold text-gray-900 border-l-4 border-green-500 pl-4 py-1">
            What are the things most people are struggling with?
          </p>
          <p>
            Well now you can get these key themes instantly, so you can adapt the session on the fly.
            This is hard to do as any teacher knows but Womble at least helps.
          </p>
          <p>
            And that’s why we’re building Womble. To give bespoke feedback to everybody, so everybody
            has the best possible chance to learn and make progress. If you want to chat, please do
            reach out:{" "}
            <a
              href="mailto:womblefeedback@gmail.com"
              className="text-green-700 hover:underline font-medium"
            >
              womblefeedback@gmail.com
            </a>
            .
          </p>
          <p className="text-[15px] italic text-gray-500 pt-2">
            Please forgive any errors. This is my writing not Claude’s.
          </p>
        </article>

        <div className="mt-12 pt-6 border-t border-gray-200">
          <Link href="/" className="text-sm text-green-600 hover:text-green-700 font-medium">
            ← Back to site
          </Link>
        </div>
      </main>
    </div>
  );
}
