import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";
import { hasSessionIdentity, isCurrentSession } from "@/utils/sessionIdentity.mjs";
import { logServerDiagnostic } from "@/utils/diagnostics.mjs";

export async function resolveSessionUser(token) {
  if (!hasSessionIdentity(token)) return null;
  const started = performance.now();
  try {
    await dbConnect();
    const user = await User.findById(token.id);
    return isCurrentSession(token, user) ? user : null;
  } finally {
    logServerDiagnostic("session_lookup", { durationMs: performance.now() - started });
  }
}

export async function getSessionUser(req) {
  return resolveSessionUser(await getToken(tokenOptions(req)));
}