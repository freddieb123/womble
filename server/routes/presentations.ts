import type { Express, Request, Response } from "express";
import { db, pool } from "@db";
import { presentations, presentationState, chatConfigs, conversations, quizResponses, quickFireQuizResponses, type PresentationFrame } from "@db/schema";
import { eq, and, count } from "drizzle-orm";
import multer from "multer";
import crypto from "crypto";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  next();
}

const presentationParticipants = new Map<number, Map<string, number>>();

function getActivePresentationParticipants(presentationId: number): number {
  const now = Date.now();
  const map = presentationParticipants.get(presentationId);
  if (!map) return 0;
  for (const [pid, ts] of map) {
    if (now - ts > 30_000) map.delete(pid);
  }
  return map.size;
}

const WOMBLE_SYNC_SCRIPT = `
<script id="__womble_sync">
(function() {
  function dispatchKey(key, keyCode) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, keyCode: keyCode, bubbles: true, cancelable: true }));
  }
  function gotoSlide(idx) {
    if (window.Reveal) {
      window.Reveal.slide(idx);
    } else {
      dispatchKey('Home', 36);
      for (var i = 0; i < idx; i++) {
        setTimeout(function(i) { return function() { dispatchKey('ArrowRight', 39); }; }(i), 80 * (i + 1));
      }
    }
  }
  // Hash-based auto-navigation: #slide-N jumps to that slide after framework init
  function applyHashNav() {
    var m = window.location.hash.match(/#slide-(\d+)/);
    if (!m) return;
    var target = parseInt(m[1]);
    if (target === 0) return;
    gotoSlide(target);
  }
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.__womble !== true) return;
    var action = e.data.action;
    if (action === 'next') {
      dispatchKey('ArrowRight', 39);
      if (window.Reveal) window.Reveal.next();
    } else if (action === 'prev') {
      dispatchKey('ArrowLeft', 37);
      if (window.Reveal) window.Reveal.prev();
    } else if (action === 'start') {
      dispatchKey('Home', 36);
      if (window.Reveal) window.Reveal.slide(0);
    } else if (action === 'goto') {
      gotoSlide(e.data.slideIndex || 0);
    }
    window.parent.postMessage({ __womble: true, type: 'ack', action: action, actionId: e.data.actionId }, '*');
  });
  // Apply hash nav after framework initialises (try at 1.5s and 4s for slower bundles)
  setTimeout(applyHashNav, 1500);
  setTimeout(applyHashNav, 4000);
  // Report slide count
  function reportSlideCount() {
    var count = 0;
    if (window.Reveal) count = window.Reveal.getTotalSlides ? window.Reveal.getTotalSlides() : 0;
    if (count > 0) { window.parent.postMessage({ __womble: true, type: 'slideCount', count: count }, '*'); return; }
    var els = document.querySelectorAll('.reveal .slides > section');
    if (els.length > 0) { window.parent.postMessage({ __womble: true, type: 'slideCount', count: els.length }, '*'); return; }
    els = document.querySelectorAll('.step');
    if (els.length > 0) { window.parent.postMessage({ __womble: true, type: 'slideCount', count: els.length }, '*'); }
  }
  setTimeout(reportSlideCount, 1500);
  setTimeout(reportSlideCount, 4000);
})();
</script>
`;

export function registerPresentationRoutes(app: Express) {

  // ── Admin CRUD ──────────────────────────────────────────────────────────────

  app.get("/api/presentations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const rows = await db.query.presentations.findMany({
        where: eq(presentations.userId, userId),
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { title, sessionId } = req.body as { title?: string; sessionId?: number };
      const [pres] = await db.insert(presentations).values({
        userId,
        sessionId: sessionId ?? null,
        title: title || "New Presentation",
        shareToken: crypto.randomUUID(),
        frames: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      res.json(pres);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/presentations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
        with: { state: true },
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      res.json(pres);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/presentations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const { title, frames } = req.body as { title?: string; frames?: PresentationFrame[] };
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (frames !== undefined) updates.frames = frames;
      const [updated] = await db.update(presentations)
        .set(updates)
        .where(and(eq(presentations.id, id), eq(presentations.userId, userId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/presentations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      await db.delete(presentationState).where(eq(presentationState.presentationId, id));
      await db.delete(presentations).where(and(eq(presentations.id, id), eq(presentations.userId, userId)));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Set slide count: generates html-slide frames from a count ───────────────

  app.post("/api/presentations/:id/set-slides", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const { slideCount } = req.body as { slideCount: number };
      if (!slideCount || slideCount < 1) return res.status(400).json({ error: "slideCount must be >= 1" });
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      // Keep all activity frames, replace all html-slide/html-deck frames
      const activities = (pres.frames ?? []).filter(f => f.type === 'activity');
      const slideFrames: PresentationFrame[] = Array.from({ length: slideCount }, (_, i) => ({
        id: crypto.randomUUID(),
        type: 'html-slide' as const,
        slideIndex: i,
      }));
      // Interleave: put all slides first, then activities that were already placed
      const updatedFrames = [...slideFrames, ...activities];
      const [updated] = await db.update(presentations)
        .set({ frames: updatedFrames, updatedAt: new Date() })
        .where(eq(presentations.id, id))
        .returning();
      res.json({ success: true, frames: updated.frames });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Activities for this presentation (scoped to its session) ─────────────────

  app.get("/api/presentations/:id/activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      let configs;
      if (pres.sessionId) {
        configs = await db.query.chatConfigs.findMany({
          where: and(
            eq(chatConfigs.userId, userId),
            eq(chatConfigs.sessionId, pres.sessionId),
            eq(chatConfigs.deleted, false)
          ),
          orderBy: (t, { asc }) => [asc(t.sessionOrder)],
        });
      } else {
        configs = await db.query.chatConfigs.findMany({
          where: and(eq(chatConfigs.userId, userId), eq(chatConfigs.deleted, false)),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });
      }
      res.json(configs.map(c => ({ id: c.id, title: c.title, type: c.type })));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── HTML deck upload ─────────────────────────────────────────────────────────

  function detectSlideCount(html: string): number {
    // Reveal.js: <section elements (works for both plain HTML and __bundler template
    // because JSON does not escape '<', so sections appear verbatim in the template string)
    const revealSections = (html.match(/<section[\s>]/gi) ?? []).length;
    if (revealSections > 0) return revealSections;
    // Impress.js: <div class="step ...">
    const impressSteps = (html.match(/class="[^"]*\bstep\b[^"]*"/gi) ?? []).length;
    if (impressSteps > 0) return impressSteps;
    return 0;
  }

  app.post("/api/presentations/:id/upload-deck", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      if (!req.file.originalname.toLowerCase().endsWith(".html")) {
        return res.status(400).json({ error: "Only .html files are supported" });
      }

      const htmlContent = req.file.buffer.toString("utf-8");
      const originalFilename = req.file.originalname;
      const slideCount = detectSlideCount(htmlContent);

      // Preserve any activity frames already in the presentation
      const existingActivities = (pres.frames ?? []).filter(f => f.type === 'activity');

      let updatedFrames: PresentationFrame[];
      if (slideCount > 0) {
        const slideFrames: PresentationFrame[] = Array.from({ length: slideCount }, (_, i) => ({
          id: crypto.randomUUID(),
          type: 'html-slide' as const,
          slideIndex: i,
        }));
        updatedFrames = [...slideFrames, ...existingActivities];
      } else {
        // Unknown format — single html-deck frame as fallback
        updatedFrames = [{ id: crypto.randomUUID(), type: 'html-deck' as const }, ...existingActivities];
      }

      const [updated] = await db.update(presentations)
        .set({ htmlContent, originalFilename, frames: updatedFrames, updatedAt: new Date() })
        .where(eq(presentations.id, id))
        .returning();

      res.json({ success: true, filename: originalFilename, slideCount, frames: updated.frames });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Serve HTML deck with injected sync script ────────────────────────────────

  app.get("/api/presentations/join/:token/deck", async (req: Request, res: Response) => {
    try {
      const pres = await db.query.presentations.findFirst({
        where: eq(presentations.shareToken, req.params.token),
      });
      if (!pres || !pres.htmlContent) return res.status(404).send("Deck not found");
      const html = pres.htmlContent.replace("</body>", `${WOMBLE_SYNC_SCRIPT}</body>`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.send(html);
    } catch (e: any) {
      res.status(500).send("Error serving deck");
    }
  });

  // ── Presenter controls ──────────────────────────────────────────────────────

  async function ensureState(presentationId: number) {
    const existing = await db.query.presentationState.findFirst({
      where: eq(presentationState.presentationId, presentationId),
    });
    if (!existing) {
      await db.insert(presentationState).values({
        presentationId,
        phase: "waiting",
        currentFrame: 0,
        fullscreenMode: false,
        updatedAt: new Date(),
      });
    }
    return existing;
  }

  app.post("/api/presentations/:id/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      await ensureState(id);
      await db.update(presentationState)
        .set({ phase: "live", currentFrame: 0, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations/:id/end", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      await db.update(presentationState)
        .set({ phase: "finished", updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations/:id/goto", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const { frame } = req.body as { frame: number };
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const clamped = Math.max(0, Math.min(frame, pres.frames.length - 1));
      await db.update(presentationState)
        .set({ currentFrame: clamped, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true, currentFrame: clamped });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations/:id/next", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
        with: { state: true },
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const current = pres.state?.currentFrame ?? 0;
      const nextIdx = Math.min(current + 1, pres.frames.length - 1);
      const nextFrame = pres.frames[nextIdx];
      const stateUpdate: Record<string, any> = { currentFrame: nextIdx, updatedAt: new Date() };
      if (nextFrame?.type === 'html-slide') {
        stateUpdate.lastAction = `goto:${nextFrame.slideIndex}`;
        stateUpdate.actionId = crypto.randomUUID();
      }
      await db.update(presentationState).set(stateUpdate).where(eq(presentationState.presentationId, id));
      res.json({ ok: true, currentFrame: nextIdx });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations/:id/prev", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
        with: { state: true },
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const current = pres.state?.currentFrame ?? 0;
      const prevIdx = Math.max(current - 1, 0);
      const prevFrame = pres.frames[prevIdx];
      const stateUpdate: Record<string, any> = { currentFrame: prevIdx, updatedAt: new Date() };
      if (prevFrame?.type === 'html-slide') {
        stateUpdate.lastAction = `goto:${prevFrame.slideIndex}`;
        stateUpdate.actionId = crypto.randomUUID();
      }
      await db.update(presentationState).set(stateUpdate).where(eq(presentationState.presentationId, id));
      res.json({ ok: true, currentFrame: prevIdx });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Within-deck slide navigation (fires postMessage to all participant iframes)
  app.post("/api/presentations/:id/slide-next", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const actionId = crypto.randomUUID();
      await db.update(presentationState)
        .set({ lastAction: "next", actionId, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true, actionId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations/:id/slide-prev", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const actionId = crypto.randomUUID();
      await db.update(presentationState)
        .set({ lastAction: "prev", actionId, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true, actionId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/presentations/:id/fullscreen", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
        with: { state: true },
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const newVal = !(pres.state?.fullscreenMode ?? false);
      await db.update(presentationState)
        .set({ fullscreenMode: newVal, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true, fullscreenMode: newVal });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/presentations/:id/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
        with: { state: true },
      });
      if (!pres) return res.status(404).json({ error: "Not found" });

      const participantCount = getActivePresentationParticipants(id);
      let submissionCount = 0;

      const state = pres.state;
      if (state && pres.frames.length > 0) {
        const frame = pres.frames[state.currentFrame];
        if (frame?.type === "activity") {
          const config = await db.query.chatConfigs.findFirst({ where: eq(chatConfigs.id, frame.configId) });
          if (config) {
            if (config.type === "quiz") {
              const [row] = await db.select({ c: count() }).from(quizResponses).where(eq(quizResponses.configId, frame.configId));
              submissionCount = Number(row?.c ?? 0);
            } else if (config.type === "quick-fire-quiz") {
              const [row] = await db.select({ c: count() }).from(quickFireQuizResponses).where(eq(quickFireQuizResponses.configId, frame.configId));
              submissionCount = Number(row?.c ?? 0);
            } else {
              const [row] = await db.select({ c: count() }).from(conversations).where(eq(conversations.configId, frame.configId));
              submissionCount = Number(row?.c ?? 0);
            }
          }
        }
      }

      res.json({
        participantCount,
        submissionCount,
        phase: state?.phase ?? "waiting",
        currentFrame: state?.currentFrame ?? 0,
        lastAction: state?.lastAction ?? null,
        actionId: state?.actionId ?? null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public participant endpoints ────────────────────────────────────────────

  app.post("/api/presentations/join/:token/heartbeat", async (req: Request, res: Response) => {
    try {
      const pres = await db.query.presentations.findFirst({
        where: eq(presentations.shareToken, req.params.token),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const { participantId } = req.body as { participantId: string };
      if (!participantId) return res.status(400).json({ error: "participantId required" });
      if (!presentationParticipants.has(pres.id)) {
        presentationParticipants.set(pres.id, new Map());
      }
      presentationParticipants.get(pres.id)!.set(participantId, Date.now());
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/presentations/join/:token", async (req: Request, res: Response) => {
    try {
      const pres = await db.query.presentations.findFirst({
        where: eq(presentations.shareToken, req.params.token),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      res.json({ id: pres.id, title: pres.title, frameCount: pres.frames.length, hasDeck: !!pres.htmlContent });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/presentations/join/:token/state", async (req: Request, res: Response) => {
    try {
      const pres = await db.query.presentations.findFirst({
        where: eq(presentations.shareToken, req.params.token),
        with: { state: true },
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      const state = pres.state;
      res.json({
        phase: state?.phase ?? "waiting",
        currentFrame: state?.currentFrame ?? 0,
        fullscreenMode: state?.fullscreenMode ?? false,
        frameCount: pres.frames.length,
        lastAction: state?.lastAction ?? null,
        actionId: state?.actionId ?? null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/presentations/join/:token/frame/:n", async (req: Request, res: Response) => {
    try {
      const n = parseInt(req.params.n);
      const pres = await db.query.presentations.findFirst({
        where: eq(presentations.shareToken, req.params.token),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      if (n < 0 || n >= pres.frames.length) return res.status(404).json({ error: "Frame not found" });
      res.json(pres.frames[n]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
