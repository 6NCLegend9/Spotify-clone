import CredentialsProvider from "next-auth/providers/credentials";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import dbConnect from "@/utils/dbconnect";
import GoogleProvider from "next-auth/providers/google";
import UserData from "@/models/UserData";
import { isRateLimited } from "@/utils/rateLimit";
import {
  AuthError,
  EMAIL_PATTERN,
  LOGIN_ERRORS,
} from "@/utils/authErrors";
import { ensureUserData } from "@/utils/userAccount";
import { GOOGLE_SIGN_IN_ENABLED } from "@/utils/siteConfig";
import { resolveSessionUser } from "@/utils/sessionAuth";
import { sessionIdentity } from "@/utils/sessionIdentity.mjs";

const googleProvider =
  GOOGLE_SIGN_IN_ENABLED
  && process.env.GOOGLE_CLIENT_ID
  && process.env.GOOGLE_CLIENT_SECRET
    ? GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
    : null;

export const authOptions = {
  providers: [
    googleProvider,
    CredentialsProvider({
      name: "Credentials",
      credentials: {},
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        if (!email) {
          throw new AuthError("Please enter your email address.", {
            title: "Email required",
          });
        }
        if (!EMAIL_PATTERN.test(email)) {
          throw new AuthError("Please enter a valid email address.", {
            title: "Invalid email",
          });
        }
        if (!password) {
          throw new AuthError("Please enter your password.", {
            title: "Password required",
          });
        }
        if (password.length > 72) {
          throw new AuthError("Passwords must be 72 characters or fewer.", {
            title: "Password too long",
          });
        }
        try {
          await dbConnect();
          const rateLimit = await isRateLimited(`credentials:${email}`, {
            windowMs: 15 * 60_000,
            max: 10,
          });
          if (rateLimit.limited) {
            throw new AuthError(LOGIN_ERRORS.rateLimited.message, {
              title: LOGIN_ERRORS.rateLimited.title,
            });
          }
          const user = await User.findOne({ email }).select("+password");

          if (!user) {
            throw new AuthError(LOGIN_ERRORS.emailNotFound.message, {
              title: LOGIN_ERRORS.emailNotFound.title,
            });
          }
          if (!user.password) {
            throw new AuthError(LOGIN_ERRORS.googleOnly.message, {
              title: LOGIN_ERRORS.googleOnly.title,
            });
          }
          const passwordMatches = await bcrypt.compare(password, user.password);
          if (!passwordMatches) {
            throw new AuthError(LOGIN_ERRORS.wrongPassword.message, {
              title: LOGIN_ERRORS.wrongPassword.title,
            });
          }
          if (!user.isVerified) {
            throw new AuthError(LOGIN_ERRORS.unverified.message, {
              title: LOGIN_ERRORS.unverified.title,
            });
          }
          await ensureUserData(user);
          return user;
        } catch (e) {
          if (e?.name === "AuthError") throw e;
          throw new AuthError("We couldn't sign you in. Please try again.", {
            title: "Couldn't sign in",
          });
        }
      },
    }),
  ].filter(Boolean),
  pages: {
    signIn: "/login",
    signOut: "/",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET,

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        const email =
          typeof user.email === "string"
            ? user.email.trim().toLowerCase()
            : "";
        let sessionUser = user;
        if (account?.provider !== "credentials") {
          if (!email) throw new Error("Session identity is unavailable");
          await dbConnect();
          sessionUser = await User.findOne({ email });
        }
        const identity = sessionIdentity(sessionUser);
        if (!identity) throw new Error("Session identity is unavailable");
        return {
          ...token,
          ...identity,
          email: sessionUser.email,
          name: sessionUser.userName,
          picture: sessionUser.imageUrl,
          userName: sessionUser.userName,
          imageUrl: sessionUser.imageUrl,
          isVerified: sessionUser.isVerified,
        };
      }
      if (!await resolveSessionUser(token)) throw new Error("Session is no longer valid");
      return token;
    },

    async session({ session, token }) {
      if (!token) return null;
      session.user = session.user || {};
      session.user.id = token.id;
      session.user.email = token.email;
      session.user.name = token.userName || token.name;
      session.user.image = token.imageUrl || token.picture;
      session.user.sessionVersion = token.sessionVersion;
      session.userName = token.userName || token.name;
      session.imageUrl = token.imageUrl || token.picture;
      session.isVerified = token.isVerified;
      return session;
    },

    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        try {
          await dbConnect();
          const name = typeof profile?.name === "string" ? profile.name.trim() : "";
          const email =
            typeof profile?.email === "string"
              ? profile.email.trim().toLowerCase()
              : "";
          const picture = typeof profile?.picture === "string" ? profile.picture : "";
          if (!email || profile?.email_verified === false) return false;
          const userDB = await User.findOne({ email });
          if (!userDB) {
            const userData = await UserData.create({});
            try {
              await User.create({
                userName: name || email.split("@")[0],
                email,
                imageUrl: picture || "/icon-192x192.png",
                userData: userData._id,
                isVerified: true,
              });
            } catch (error) {
              await UserData.deleteOne({ _id: userData._id }).catch(() => {});
              throw error;
            }
          } else {
            if (!userDB.isVerified) {
              userDB.isVerified = true;
              if (picture) userDB.imageUrl = picture;
              await userDB.save();
            }
            await ensureUserData(userDB);
          }
          return true;
        } catch (e) {
          console.error("Google sign-in failed:", e);
          return false;
        }
      }
      return true;
    },
  },
};
