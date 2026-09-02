import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";
import { ApiRouteError } from "@/utils/apiResponse";

export function normalizeAccountEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function ensureUserData(user) {
  if (!user?._id) return null;

  if (user.userData) {
    const existing = await UserData.findById(user.userData);
    if (existing) return existing;
  }

  const created = await UserData.create({});
  try {
    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        $or: [
          { userData: { $exists: false } },
          { userData: null },
          ...(user.userData ? [{ userData: user.userData }] : []),
        ],
      },
      { $set: { userData: created._id } },
      { new: true },
    );

    if (updated) {
      user.userData = created._id;
      return created;
    }

    await UserData.deleteOne({ _id: created._id }).catch(() => {});
    const freshUser = await User.findById(user._id).select("userData");
    const winner = freshUser?.userData
      ? await UserData.findById(freshUser.userData)
      : null;
    if (winner) {
      user.userData = winner._id;
      return winner;
    }

    throw new ApiRouteError("INTERNAL_ERROR", {
      message: "We couldn't load your library. Please try again.",
    });
  } catch (error) {
    if (!(error instanceof ApiRouteError)) {
      await UserData.deleteOne({ _id: created._id }).catch(() => {});
    }
    throw error;
  }
}

export async function getAuthenticatedAccount(req) {
  const token = await getToken(tokenOptions(req));
  const email = normalizeAccountEmail(token?.email);
  if (!email) {
    throw new ApiRouteError("UNAUTHORIZED", {
      message: "Log in to continue.",
    });
  }

  await dbConnect();
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiRouteError("NOT_FOUND", {
      message: "Your profile is no longer available.",
    });
  }

  const userData = await ensureUserData(user);
  return { user, userData, email };
}
