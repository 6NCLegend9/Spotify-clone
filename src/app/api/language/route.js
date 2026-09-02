import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import UserData from "@/models/UserData";
import { tokenOptions } from "@/utils/authToken";
import { isRateLimited } from "@/utils/rateLimit";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_LANGUAGES = 12;
const LANGUAGE_PATTERN = /^[\p{L}][\p{L}\p{M}\s-]{1,39}$/u;

function validateLanguages(value) {
  if (!Array.isArray(value) || value.length > MAX_LANGUAGES) {
    throw new ApiRouteError("VALIDATION_ERROR", {
      message: `language must be an array containing at most ${MAX_LANGUAGES} values.`,
    });
  }

  const languages = [];
  const seen = new Set();
  for (const valueItem of value) {
    const language = typeof valueItem === "string"
      ? valueItem.trim().replace(/\s+/g, " ")
      : "";
    if (!LANGUAGE_PATTERN.test(language)) {
      throw new ApiRouteError("VALIDATION_ERROR", {
        message: "Each language must be a valid name between 2 and 40 characters.",
      });
    }
    const key = language.toLocaleLowerCase("en");
    if (!seen.has(key)) {
      seen.add(key);
      languages.push(language);
    }
  }
  return languages;
}

export async function GET(request) {
  try {
    const token = await getToken(tokenOptions(request));
    if (!token?.email) return NextResponse.json({ authenticated: false, language: null });

    const { userData } = await getAuthenticatedAccount(request);
    return NextResponse.json({ authenticated: true, language: userData?.language || null });
  } catch (error) {
    return handleApiError(error, "Load language preferences");
  }
}

export async function PUT(request) {
  try {
    const { userData: accountData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`language:${email}`, {
      windowMs: 15 * 60_000,
      max: 30,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many language updates. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(request);
    const language = validateLanguages(body.language);

    const userData = await UserData.findByIdAndUpdate(
      accountData._id,
      { $set: { language } },
      { new: true, runValidators: true },
    ).select("language").lean();
    if (!userData) {
      return apiError("NOT_FOUND", { message: "User profile not found." });
    }
    return NextResponse.json({ success: true, language: userData.language });
  } catch (error) {
    return handleApiError(error, "Update language preferences");
  }
}
