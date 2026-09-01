import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import Tag, { TAG_CATEGORIES } from "@/models/Tag";
import User from "@/models/User";
import UserData from "@/models/UserData";
import { ensureSystemTags, toCatalogItem } from "@/services/genreCatalog";
import { normalizeGenreName, slugifyGenre } from "@/utils/genreTaxonomy";
import { tokenOptions } from "@/utils/authToken";
import dbConnect from "@/utils/dbconnect";

const MAX_PERSONAL_TAGS = 80;
const MAX_SEARCH_RESULTS = 50;

function matchesQuery(tag, normalizedQuery) {
  if (!normalizedQuery) return true;
  return [tag.normalizedName, ...(tag.aliasKeys || [])]
    .some((value) => value.includes(normalizedQuery));
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

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Get tags error:", error);
    return NextResponse.json({ error: "Unable to load tags." }, { status: 500 });
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
  const category = typeof body?.category === "string" ? body.category : "other";

  if (displayName.length < 2 || displayName.length > 80 || normalizedName.length < 2) {
    return NextResponse.json({ error: "Tag names must be between 2 and 80 characters." }, { status: 422 });
  }
  if (!TAG_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "The tag category is invalid." }, { status: 422 });
  }

  try {
    await dbConnect();
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
      return NextResponse.json({ error: "You can save up to 80 personal tags." }, { status: 422 });
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
      return NextResponse.json({ error: "That tag already exists in your catalog." }, { status: 409 });
    }
    console.error("Create personal tag error:", error);
    return NextResponse.json({ error: "Unable to create the tag." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "The tag identifier is invalid." }, { status: 422 });
  }

  try {
    await dbConnect();
    const tag = await Tag.findOneAndDelete({ _id: id, scope: "personal", ownerId: user._id }).lean();
    if (!tag) return NextResponse.json({ error: "Personal tag not found." }, { status: 404 });

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
    console.error("Delete personal tag error:", error);
    return NextResponse.json({ error: "Unable to delete the tag." }, { status: 500 });
  }
}