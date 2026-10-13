import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/utils/authOptions";
import { readRequestText } from "@/utils/apiResponseCore.mjs";
import { handleApiError } from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 15;

const handler = NextAuth(authOptions);
export { handler as GET };
export async function POST(request, context) {
  try {
    const body = await readRequestText(request, { maxBytes: 16 * 1024 });
    return handler(new NextRequest(request.url, {
      method: "POST", headers: request.headers, signal: request.signal, body,
    }), context);
  } catch (error) {
    return handleApiError(error, "Authentication request");
  }
}
