import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import Genre from "@/models/Genre";
import User from "@/models/User";
import UserData from "@/models/UserData";
import { ensureSystemGenres, toCatalogItem } from "@/services/genreCatalog";
import { MAX_GENRE_DEPTH, normalizeGenreName, slugifyGenre } from "@/utils/genreTaxonomy";
import { tokenOptions } from "@/utils/authToken";
import dbConnect from "@/utils/dbconnect";

const MAX_PERSONAL_GENRES = 40;
const MAX_SEARCH_RESULTS = 50;

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

async function authenticatedUser(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) return null;
  return User.findOne({ email: token.email }).select("_id userData").lean();
}

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") || "en";
    const normalizedQuery = normalizeGenreName(searchParams.get("q"));

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
    });
  } catch (error) {
    console.error("Get genres error:", error);
    return NextResponse.json({ error: "Unable to load genres." }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const displayName = typeof body?.name === "string"
    ? body.name.trim().replace(/\s+/g, " ")
    : "";
  const normalizedName = normalizeGenreName(displayName);

  if (displayName.length < 2 || displayName.length > 80 || normalizedName.length < 2) {
    return NextResponse.json({ error: "Genre names must be between 2 and 80 characters." }, { status: 422 });
  }

  try {
    await dbConnect();
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
      return NextResponse.json({ error: "You can save up to 40 personal genres." }, { status: 422 });
    }

    let parent = null;
    if (body.parentId) {
      if (!mongoose.isValidObjectId(body.parentId)) {
        return NextResponse.json({ error: "The selected parent genre is invalid." }, { status: 422 });
      }
      parent = await Genre.findById(body.parentId).lean();
      const ownsPersonalParent = parent?.scope === "personal" && parent.ownerId.toString() === user._id.toString();
      if (!parent || (parent.scope !== "system" && !ownsPersonalParent)) {
        return NextResponse.json({ error: "The selected parent genre is unavailable." }, { status: 404 });
      }
      if (parent.depth >= MAX_GENRE_DEPTH) {
        return NextResponse.json({ error: "Genres can be nested up to four levels." }, { status: 422 });
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
      return NextResponse.json({ error: "That genre already exists in your catalog." }, { status: 409 });
    }
    console.error("Create personal genre error:", error);
    return NextResponse.json({ error: "Unable to create the genre." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "The genre identifier is invalid." }, { status: 422 });
  }

  try {
    await dbConnect();
    const genre = await Genre.findOne({ _id: id, scope: "personal", ownerId: user._id }).lean();
    if (!genre) return NextResponse.json({ error: "Personal genre not found." }, { status: 404 });

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
    console.error("Delete personal genre error:", error);
    return NextResponse.json({ error: "Unable to delete the genre." }, { status: 500 });
  }
}