import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";
import { isDisabledPublicDemoClinicianEmail } from "../lib/publicDemoAccountPolicy";

declare global {
  namespace Express {
    interface User extends AuthUser {
      appRole?: string | null;
      accountType?: string | null;
    }

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  if (isDisabledPublicDemoClinicianEmail(refreshed.user.email)) {
    await clearSession(res, sid);
    next();
    return;
  }

  try {
    const [profile] = await db
      .select({
        appRole: userProfilesTable.appRole,
        accountType: userProfilesTable.accountType,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.id, refreshed.user.id));

    // Never use role or account-type claims from the browser/session as
    // authorization truth. Refresh them from the server-owned profile row.
    req.user = Object.assign({}, refreshed.user, {
      appRole: profile?.appRole ?? null,
      accountType: profile?.accountType ?? null,
    });
  } catch {
    res.status(503).json({ error: "Unable to verify account permissions." });
    return;
  }
  next();
}
