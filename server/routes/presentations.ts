import type { Express, Request, Response } from "express";
import { db, pool } from "@db";
import { presentations, presentationState, chatConfigs, conversations, quizResponses, quickFireQuizResponses, type PresentationFrame } from "@db/schema";
import { eq, and, count } from "drizzle-orm";
import multer from "multer";
import crypto from "crypto";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// In-memory participant heartbeat tracking (same pattern as quizParticipants)
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
      const { title } = req.body as { title?: string };
      const [pres] = await db.insert(presentations).values({
        userId,
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
      const next = Math.min(current + 1, pres.frames.length - 1);
      await db.update(presentationState)
        .set({ currentFrame: next, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true, currentFrame: next });
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
      const prev = Math.max(current - 1, 0);
      await db.update(presentationState)
        .set({ currentFrame: prev, updatedAt: new Date() })
        .where(eq(presentationState.presentationId, id));
      res.json({ ok: true, currentFrame: prev });
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
        if (frame?.type === 'activity') {
          const configId = frame.configId;
          const config = await db.query.chatConfigs.findFirst({ where: eq(chatConfigs.id, configId) });
          if (config) {
            if (config.type === 'quiz') {
              const [row] = await db.select({ c: count() }).from(quizResponses).where(eq(quizResponses.configId, configId));
              submissionCount = Number(row?.c ?? 0);
            } else if (config.type === 'quick-fire-quiz') {
              const [row] = await db.select({ c: count() }).from(quickFireQuizResponses).where(eq(quickFireQuizResponses.configId, configId));
              submissionCount = Number(row?.c ?? 0);
            } else {
              const [row] = await db.select({ c: count() }).from(conversations).where(eq(conversations.configId, configId));
              submissionCount = Number(row?.c ?? 0);
            }
          }
        }
      }

      res.json({ participantCount, submissionCount, phase: state?.phase ?? 'waiting', currentFrame: state?.currentFrame ?? 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── CloudConvert PPTX upload ─────────────────────────────────────────────────

  app.post("/api/presentations/:id/upload-deck", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const id = parseInt(req.params.id);
      const pres = await db.query.presentations.findFirst({
        where: and(eq(presentations.id, id), eq(presentations.userId, userId)),
      });
      if (!pres) return res.status(404).json({ error: "Not found" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const apiKey = process.env.CLOUDCONVERT_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "CLOUDCONVERT_API_KEY not configured" });

      // 1. Create job
      const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: {
            "upload-my-file": { operation: "import/upload" },
            "convert-my-file": {
              operation: "convert",
              input: "upload-my-file",
              input_format: "pptx",
              output_format: "png",
              per_page: true,
              dpi: 150,
            },
            "export-my-file": {
              operation: "export/url",
              input: "convert-my-file",
            },
          },
        }),
      });
      if (!jobRes.ok) {
        const err = await jobRes.text();
        return res.status(502).json({ error: `CloudConvert job creation failed: ${err}` });
      }
      const job = await jobRes.json() as any;

      // 2. Upload the file to the signed URL
      const uploadTask = job.data.tasks.find((t: any) => t.name === "upload-my-file");
      if (!uploadTask?.result?.form) {
        return res.status(502).json({ error: "No upload form in CloudConvert response" });
      }
      const { url: uploadUrl, parameters } = uploadTask.result.form;
      const formData = new FormData();
      for (const [k, v] of Object.entries(parameters as Record<string, string>)) {
        formData.append(k, v);
      }
      formData.append("file", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
      await fetch(uploadUrl, { method: "POST", body: formData });

      // 3. Poll until finished
      const jobId = job.data.id;
      let finished = false;
      let jobData: any;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pollRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        jobData = await pollRes.json();
        if (jobData.data?.status === "finished") { finished = true; break; }
        if (jobData.data?.status === "error") {
          return res.status(502).json({ error: "CloudConvert conversion failed" });
        }
      }
      if (!finished) return res.status(504).json({ error: "CloudConvert conversion timed out" });

      // 4. Download PNGs and convert to base64
      const exportTask = jobData.data.tasks.find((t: any) => t.name === "export-my-file");
      const exportFiles: { url: string; filename: string }[] = exportTask?.result?.files ?? [];
      exportFiles.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

      const newFrames: PresentationFrame[] = [];
      for (const f of exportFiles) {
        const imgRes = await fetch(f.url);
        const buf = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        newFrames.push({
          id: crypto.randomUUID(),
          type: "slide",
          imageDataUrl: `data:image/png;base64,${b64}`,
        });
      }

      // 5. Append to existing frames
      const updated = [...pres.frames, ...newFrames];
      const [updatedPres] = await db.update(presentations)
        .set({ frames: updated, updatedAt: new Date() })
        .where(eq(presentations.id, id))
        .returning();

      res.json(updatedPres);
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
      res.json({ id: pres.id, title: pres.title, frameCount: pres.frames.length });
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
