import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import UserData from "@/models/UserData";
import { tokenOptions } from "@/utils/authToken";
import { EQ_PRESET_BANDS } from "@/utils/eqPresets";
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

const allowedKeys = [
  "eqPreset", "eqBands", "dataSaver", "audioOnly",
  "wifiOnlyDownloads", "streamingQuality", "videoQuality", "normalization", "monoAudio", "explicitContent",
  "privateSession", "tailoredAds", "syncedLyrics", "pictureInPicture", "masterVolume",
];
const booleanKeys = new Set([
  "dataSaver", "audioOnly", "wifiOnlyDownloads", "monoAudio", "explicitContent",
  "privateSession", "tailoredAds", "syncedLyrics", "pictureInPicture",
]);
const enumValues = {
  streamingQuality: new Set(["auto", "low", "normal", "high", "very-high"]),
  videoQuality: new Set(["auto", "720p", "1080p", "audio-only"]),
  normalization: new Set(["quiet", "normal", "loud"]),
};
const eqPresets = new Set([...Object.keys(EQ_PRESET_BANDS), "Custom"]);

function invalidSetting(message) {
  throw new ApiRouteError("VALIDATION_ERROR", { message });
}

function validatedSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidSetting("Settings must be provided as an object.");
  }

  const settings = {};
  for (const key of allowedKeys) {
    if (value[key] === undefined) continue;
    const setting = value[key];

    if (booleanKeys.has(key)) {
      if (typeof setting !== "boolean") invalidSetting(`${key} must be true or false.`);
    } else if (enumValues[key]) {
      if (typeof setting !== "string" || !enumValues[key].has(setting)) {
        invalidSetting(`${key} has an unsupported value.`);
      }
    } else if (key === "eqPreset") {
      if (typeof setting !== "string" || !eqPresets.has(setting)) {
        invalidSetting("eqPreset has an unsupported value.");
      }
    } else if (key === "eqBands") {
      if (
        !Array.isArray(setting)
        || setting.length !== 5
        || setting.some((band) => !Number.isFinite(band) || band < -12 || band > 12)
      ) {
        invalidSetting("eqBands must contain five numbers between -12 and 12.");
      }
    } else if (
      key === "masterVolume"
      && (!Number.isFinite(setting) || setting < 0 || setting > 1)
    ) {
      invalidSetting("masterVolume must be a number between 0 and 1.");
    }

    settings[key] = setting;
  }
  return settings;
}

export async function GET(request) {
  try {
    const token = await getToken(tokenOptions(request));
    if (!token?.email) return NextResponse.json({ authenticated: false, settings: null });

    const { userData } = await getAuthenticatedAccount(request);
    return NextResponse.json({ authenticated: true, settings: userData?.settings || null, genres: userData?.genres || [] });
  } catch (error) {
    return handleApiError(error, "Load settings");
  }
}

export async function PUT(request) {
  try {
    const { userData: accountData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`settings:${email}`, {
      windowMs: 15 * 60_000,
      max: 60,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many settings updates. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(request);
    const settings = validatedSettings(body.settings);
    const userData = await UserData.findByIdAndUpdate(
      accountData._id,
      { $set: Object.fromEntries(Object.entries(settings).map(([key, value]) => [`settings.${key}`, value])) },
      { new: true, runValidators: true },
    ).select("settings").lean();
    if (!userData) {
      return apiError("NOT_FOUND", { message: "User profile not found." });
    }
    return NextResponse.json({ success: true, settings: userData.settings });
  } catch (error) {
    return handleApiError(error, "Update settings");
  }
}
