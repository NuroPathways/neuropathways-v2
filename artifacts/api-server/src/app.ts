import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(helmet());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
});
app.use("/api/client-session/login", authLimiter);
app.use("/api/auth", authLimiter);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = (process.env.CORS_ORIGIN || "https://nuropath-ai.replit.app").split(",");
const REPLIT_ID = process.env.REPL_ID;
const REPLIT_SLUG = process.env.REPL_SLUG;
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (origin && (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app"))) {
      if ((REPLIT_ID && origin.includes(REPLIT_ID))
          || (REPLIT_SLUG && origin.includes(REPLIT_SLUG))) {
        return callback(null, true);
      }
    }
    callback(null, false);
  },
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error({ err }, "Unhandled error");
  res.status(err.status || 500).json({ error: "Internal server error" });
});

export default app;
