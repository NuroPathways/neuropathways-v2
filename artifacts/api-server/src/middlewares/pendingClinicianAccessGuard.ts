import type { Request, Response, NextFunction } from "express";
import { isPendingClinicianRequestAllowed, PENDING_CLINICIAN_ROLE } from "../lib/securityPolicies";

export function pendingClinicianAccessGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.appRole !== PENDING_CLINICIAN_ROLE) {
    next();
    return;
  }

  const requestPath = `${req.baseUrl || ""}${req.path}`;
  if (isPendingClinicianRequestAllowed(req.method, requestPath)) {
    next();
    return;
  }

  res.status(403).json({
    error: "Clinician access is pending clinic administrator approval.",
    accountStatus: "pending_approval",
  });
}
