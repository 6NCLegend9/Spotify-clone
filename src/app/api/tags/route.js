import mongoose from "mongoose";
import { NextResponse } from "next/server";
import Tag, { TAG_CATEGORIES } from "@/models/Tag";
import UserData from "@/models/UserData";
import { ensureSystemTags, toCatalogItem } from "@/services/genreCatalog";
import { normalizeGenreName, slugifyGenre } from "@/utils/genreTaxonomy";
import { getSessionUser as authenticatedUser } from "@/utils/sessionAuth";
import dbConnect from "@/utils/dbconnect";
import { isRateLimited } from "@/utils/rateLimit";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";

const MAX_PERSONAL_TAGS = 80;
const MAX_SEARCH_RESULTS = 50;
const MAX_QUERY_LENGTH = 100;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

function matchesQuery(tag, normalizedQuery) {
  if (!normalizedQuery) return true;
  return [tag.normalizedName, ...(tag.aliasKeys || [])]
    .some((value) => value.includes(normalizedQuery));
}

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") || "en";
    const query = searchParams.get("q") || "";
    if (!LOCALE_PATTERN.test(locale) || query.length > MAX_QUERY_LENGTH) {
      throw new ApiRouteError("VALIDATION_ERROR", {
        message: "The tag search parameters are invalid.",
      });
    }
    const normalizedQuery = normalizeGenreName(query);

    await dbConnect();
    const [systemTags, user] = await Promise.all([
      ensureSystemTags(),
      authenticatedUser(request),
    ]);
    const personalTags = user
      ? await Tag.find({ scope: "personal", ownerId: user._id }).sort({ displayName: 1 }).lean()
      : [];
    const tags = [...systemTags, ...personalTags]
      .filter((tag) => matchesQuery(tag, normalizedQuery))
      .slice(0, MAX_SEARCH_RESULTS)
      .map((tag) => ({ ...toCatalogItem(tag, locale), category: tag.category }));

    return NextResponse.json({ tags }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, "Load tags");
  }
}

export async function POST(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) {
      return apiError("UNAUTHORIZED", { message: "You must be logged in." });
    }

    const rateLimit = await isRateLimited(`tags:create:${user._id}`, {
      windowMs: 15 * 60_000,
      max: 40,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many tag changes. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(request);
    const displayName = typeof body.name === "string"
      ? body.name.trim().replace(/\s+/g, " ")
      : "";
    const normalizedName = normalizeGenreName(displayName);
    const category = body.category === undefined ? "other" : body.category;

    if (displayName.length < 2 || displayName.length > 80 || normalizedName.length < 2) {
      return apiError("UNPROCESSABLE", {
        message: "Tag names must be between 2 and 80 characters.",
      });
    }
    if (typeof category !== "string" || !TAG_CATEGORIES.includes(category)) {
      return apiError("UNPROCESSABLE", { message: "The tag category is invalid." });
    }

    const systemTags = await ensureSystemTags();
    const matchingSystemTag = systemTags.find((tag) =>
      [tag.normalizedName, ...(tag.aliasKeys || [])].includes(normalizedName),
    );
    if (matchingSystemTag) {
      return NextResponse.json({
        success: true,
        created: false,
        tag: { ...toCatalogItem(matchingSystemTag, "en"), category: matchingSystemTag.category },
      });
    }

    const existingPersonalTag = await Tag.findOne({
      scope: "personal",
      ownerId: user._id,
      normalizedName,
    }).lean();
    if (existingPersonalTag) {
      return NextResponse.json({
        success: true,
        created: false,
        tag: { ...toCatalogItem(existingPersonalTag, "en"), category: existingPersonalTag.category },
      });
    }

    const personalTagCount = await Tag.countDocuments({ scope: "personal", ownerId: user._id });
    if (personalTagCount >= MAX_PERSONAL_TAGS) {
      return apiError("UNPROCESSABLE", { message: "You can save up to 80 personal tags." });
    }

    const tag = await Tag.create({
      displayName,
      normalizedName,
      slug: `custom-tag-${user._id}-${slugifyGenre(displayName)}`,
      category,
      aliases: [],
      aliasKeys: [],
      translations: { en: displayName },
      scope: "personal",
      ownerId: user._id,
    });

    return NextResponse.json({
      success: true,
      created: true,
      tag: { ...toCatalogItem(tag, "en"), category: tag.category },
    }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) {
      return apiError("CONFLICT", { message: "That tag already exists in your catalog." });
    }
    return handleApiError(error, "Create personal tag");
  }
}

export async function DELETE(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) {
      return apiError("UNAUTHORIZED", { message: "You must be logged in." });
    }

    const rateLimit = await isRateLimited(`tags:delete:${user._id}`, {
      windowMs: 15 * 60_000,
      max: 60,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many tag changes. Please wait before trying again.",
      });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!mongoose.isValidObjectId(id)) {
      return apiError("UNPROCESSABLE", { message: "The tag identifier is invalid." });
    }

    const tag = await Tag.findOneAndDelete({ _id: id, scope: "personal", ownerId: user._id }).lean();
    if (!tag) {
      return apiError("NOT_FOUND", { message: "Personal tag not found." });
    }

    if (user.userData) {
      await UserData.findByIdAndUpdate(user.userData, {
        $pull: {
          tags: tag.displayName,
          tagIds: tag._id,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Delete personal tag");
  }
}