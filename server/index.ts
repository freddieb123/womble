import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupGroupBoardWS } from "./routes/group-board-ws";
import { setupVite, log } from "./vite";
import path from "path";
import fs from "fs";

const app = express();

// Increase JSON payload size limit to 50MB for handling base64 encoded images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Enhanced logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Add SEO-friendly headers
  res.setHeader('X-Robots-Tag', 'index, follow');
  
  // Enable CORS for SEO tools
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
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

const startServer = async () => {
  try {
    const server = registerRoutes(app);
    setupGroupBoardWS(server);

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
        const rootDir = process.env.REPL_SLUG ? `/home/runner/${process.env.REPL_SLUG}` : process.cwd();
        const distPath = path.join(rootDir, "dist", "public");
        console.log("Serving static files from:", distPath);

        if (!fs.existsSync(distPath)) {
          console.error(`Error: Build directory not found at ${distPath}`);
          console.error('Current directory contents:', fs.readdirSync(rootDir));
          throw new Error('Build directory not found');
        }

        app.use(express.static(distPath));
        app.get('*', (req, res, next) => {
          if (req.path.startsWith('/api')) {
            return next();
          }
          res.sendFile(path.join(distPath, 'index.html'));
        });
      } catch (error) {
        console.error("Error setting up static file serving:", error);
        app.get('*', (req, res) => {
          res.status(500).send('Server configuration error');
        });
      }
    }

    const port = parseInt(process.env.PORT || "5000", 10);

    try {
      server.listen(port, "0.0.0.0")
        .once('error', (err: any) => {
          console.error(`Failed to start server on port ${port}:`, err);
          process.exit(1);
        })
        .once('listening', () => {
          log(`Server running at http://0.0.0.0:${port} in ${app.get("env")} mode`);
        });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
};

startServer();