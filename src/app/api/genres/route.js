import mongoose from "mongoose";
import { NextResponse } from "next/server";
import Genre from "@/models/Genre";
import UserData from "@/models/UserData";
import { ensureSystemGenres, toCatalogItem } from "@/services/genreCatalog";
import { MAX_GENRE_DEPTH, normalizeGenreName, slugifyGenre } from "@/utils/genreTaxonomy";
import { getSessionUser as authenticatedUser } from "@/utils/sessionAuth";
import dbConnect from "@/utils/dbconnect";
import { isRateLimited } from "@/utils/rateLimit";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";

const MAX_PERSONAL_GENRES = 40;
const MAX_SEARCH_RESULTS = 50;
const MAX_QUERY_LENGTH = 100;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

function matchesQuery(genre, normalizedQuery) {
  if (!normalizedQuery) return true;
  return [genre.normalizedName, ...(genre.aliasKeys || [])]
    .some((value) => value.includes(normalizedQuery));
}

function buildGenreTree(genres, locale) {
  const items = genres.map((genre) => ({ ...toCatalogItem(genre, locale), children: [] }));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const roots = [];

  for (const item of items) {
    const parent = item.parentId ? itemsById.get(item.parentId) : null;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }

  return roots;
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
        message: "The genre search parameters are invalid.",
      });
    }
    const normalizedQuery = normalizeGenreName(query);

    await dbConnect();
    const [systemGenres, user] = await Promise.all([
      ensureSystemGenres(),
      authenticatedUser(request),
    ]);
    const personalGenres = user
      ? await Genre.find({ scope: "personal", ownerId: user._id }).sort({ displayName: 1 }).lean()
      : [];
    const visibleGenres = [...systemGenres, ...personalGenres];
    const matchingGenres = visibleGenres.filter((genre) => matchesQuery(genre, normalizedQuery));
    const matches = normalizedQuery
      ? matchingGenres.slice(0, MAX_SEARCH_RESULTS)
      : matchingGenres;

    return NextResponse.json({
      genres: matches.map((genre) => toCatalogItem(genre, locale)),
      tree: normalizedQuery ? [] : buildGenreTree(systemGenres, locale),
      personalGenres: personalGenres.map((genre) => toCatalogItem(genre, locale)),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, "Load genres");
  }
}

export async function POST(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) {
      return apiError("UNAUTHORIZED", { message: "You must be logged in." });
    }

    const rateLimit = await isRateLimited(`genres:create:${user._id}`, {
      windowMs: 15 * 60_000,
      max: 30,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many genre changes. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(request);
    const displayName = typeof body.name === "string"
      ? body.name.trim().replace(/\s+/g, " ")
      : "";
    const normalizedName = normalizeGenreName(displayName);

    if (displayName.length < 2 || displayName.length > 80 || normalizedName.length < 2) {
      return apiError("UNPROCESSABLE", {
        message: "Genre names must be between 2 and 80 characters.",
      });
    }

    const systemGenres = await ensureSystemGenres();
    const matchingSystemGenre = systemGenres.find((genre) =>
      matchesQuery(genre, normalizedName) && [genre.normalizedName, ...(genre.aliasKeys || [])].includes(normalizedName),
    );
    if (matchingSystemGenre) {
      return NextResponse.json({
        success: true,
        created: false,
        genre: toCatalogItem(matchingSystemGenre, "en"),
      });
    }

    const existingPersonalGenre = await Genre.findOne({
      scope: "personal",
      ownerId: user._id,
      normalizedName,
    }).lean();
    if (existingPersonalGenre) {
      return NextResponse.json({
        success: true,
        created: false,
        genre: toCatalogItem(existingPersonalGenre, "en"),
      });
    }

    const personalGenreCount = await Genre.countDocuments({ scope: "personal", ownerId: user._id });
    if (personalGenreCount >= MAX_PERSONAL_GENRES) {
      return apiError("UNPROCESSABLE", { message: "You can save up to 40 personal genres." });
    }

    let parent = null;
    if (body.parentId !== undefined && body.parentId !== null && body.parentId !== "") {
      if (typeof body.parentId !== "string") {
        return apiError("UNPROCESSABLE", { message: "The selected parent genre is invalid." });
      }
      if (!mongoose.isValidObjectId(body.parentId)) {
        return apiError("UNPROCESSABLE", { message: "The selected parent genre is invalid." });
      }
      parent = await Genre.findById(body.parentId).lean();
      const ownsPersonalParent = parent?.scope === "personal"
        && parent.ownerId?.toString() === user._id.toString();
      if (!parent || (parent.scope !== "system" && !ownsPersonalParent)) {
        return apiError("NOT_FOUND", { message: "The selected parent genre is unavailable." });
      }
      if (parent.depth >= MAX_GENRE_DEPTH) {
        return apiError("UNPROCESSABLE", { message: "Genres can be nested up to four levels." });
      }
    }

    const genre = await Genre.create({
      displayName,
      normalizedName,
      slug: `custom-${user._id}-${slugifyGenre(displayName)}`,
      parentId: parent?._id || null,
      ancestorIds: parent ? [...(parent.ancestorIds || []), parent._id] : [],
      depth: parent ? parent.depth + 1 : 0,
      aliases: [],
      aliasKeys: [],
      translations: { en: displayName },
      scope: "personal",
      ownerId: user._id,
    });

    return NextResponse.json({ success: true, created: true, genre: toCatalogItem(genre, "en") }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) {
      return apiError("CONFLICT", { message: "That genre already exists in your catalog." });
    }
    return handleApiError(error, "Create personal genre");
  }
}

export async function DELETE(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) {
      return apiError("UNAUTHORIZED", { message: "You must be logged in." });
    }

    const rateLimit = await isRateLimited(`genres:delete:${user._id}`, {
      windowMs: 15 * 60_000,
      max: 40,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many genre changes. Please wait before trying again.",
      });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!mongoose.isValidObjectId(id)) {
      return apiError("UNPROCESSABLE", { message: "The genre identifier is invalid." });
    }

    const genre = await Genre.findOne({ _id: id, scope: "personal", ownerId: user._id }).lean();
    if (!genre) {
      return apiError("NOT_FOUND", { message: "Personal genre not found." });
    }

    const removedGenres = await Genre.find({
      scope: "personal",
      ownerId: user._id,
      $or: [{ _id: genre._id }, { ancestorIds: genre._id }],
    }).select("_id displayName").lean();
    await Genre.deleteMany({ _id: { $in: removedGenres.map((item) => item._id) } });

    if (user.userData) {
      await UserData.findByIdAndUpdate(user.userData, {
        $pull: {
          genres: { $in: removedGenres.map((item) => item.displayName) },
          genreIds: { $in: removedGenres.map((item) => item._id) },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Delete personal genre");
  }
}