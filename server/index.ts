import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, log } from "./vite";
import path from "path";

const app = express();

// Increase JSON payload size limit to 50MB for handling base64 encoded images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Enhanced logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

    // Log all requests in production, not just API calls
    if (app.get("env") === "production" || path.startsWith("/api")) {
      log(`${logLine}${capturedJsonResponse ? ` :: ${JSON.stringify(capturedJsonResponse)}` : ''}`);
    }
  });

  next();
});

(async () => {
  const server = registerRoutes(app);

  // Global error handler with enhanced logging
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Server Error:", {
      status,
      message,
      stack: err.stack,
      path: _req.path
    });

    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    console.log("Starting server in development mode");
    await setupVite(app, server);
  } else {
    console.log("Starting server in production mode");
    try {
      // Serve static files from the dist directory
      const distPath = path.join(process.cwd(), "dist");
      console.log("Serving static files from:", distPath);

      app.use(express.static(distPath, {
        index: false // Don't serve index.html for all routes
      }));

      // Serve index.html for all routes (SPA fallback)
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
          return next();
        }
        console.log(`Serving index.html for path: ${req.path}`);
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } catch (error) {
      console.error("Error setting up static file serving:", error);
    }
  }

  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`Server running at http://0.0.0.0:${PORT} in ${app.get("env")} mode`);
  });
})();