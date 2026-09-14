import CredentialsProvider from "next-auth/providers/credentials";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import dbConnect from "@/utils/dbconnect";
import GoogleProvider from "next-auth/providers/google";
import UserData from "@/models/UserData";
import { isRateLimited } from "@/utils/rateLimit";
import {
  AuthError,
  AUTH_FAILURE_CODES,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "@/utils/authErrors";
import { ensureUserData } from "@/utils/userAccount";
import { GOOGLE_SIGN_IN_ENABLED } from "@/utils/siteConfig";
import {
  resolveSessionUser,
  SessionLookupUnavailableError,
} from "@/utils/sessionAuth";
import { sessionIdentity } from "@/utils/sessionIdentity.mjs";
import { safeReturnPath } from "@/utils/appOrigin.mjs";
import { resolveAuthBaseUrl } from "@/utils/trustedOrigin";
import { logServerDiagnostic } from "@/utils/diagnostics.mjs";

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
        const email = normalizeEmail(credentials?.email);
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        if (validateEmail(email) || validatePassword(password)) {
          throw new AuthError(AUTH_FAILURE_CODES.invalidCredentials);
        }
        try {
          await dbConnect();
          const rateLimit = await isRateLimited(`credentials:${email}`, {
            windowMs: 15 * 60_000,
            max: 10,
          });
          if (rateLimit.limited) {
            logServerDiagnostic("provider", { code: "RATE_LIMITED" });
            throw new AuthError(AUTH_FAILURE_CODES.rateLimited);
          }
          const user = await User.findOne({ email }).select("+password");

          if (!user || !user.password) {
            logServerDiagnostic("provider", { code: "UNAUTHORIZED" });
            throw new AuthError(AUTH_FAILURE_CODES.invalidCredentials);
          }
          const passwordMatches = await bcrypt.compare(password, user.password);
          if (!passwordMatches) {
            logServerDiagnostic("provider", { code: "UNAUTHORIZED" });
            throw new AuthError(AUTH_FAILURE_CODES.invalidCredentials);
          }
          if (!user.isVerified) {
            logServerDiagnostic("provider", { code: "UNAUTHORIZED" });
            throw new AuthError(AUTH_FAILURE_CODES.unverified);
          }
          await ensureUserData(user);
          return user;
        } catch (e) {
          if (e?.name === "AuthError") throw e;
          logServerDiagnostic("provider", { code: "INTERNAL_ERROR" });
          throw new AuthError(AUTH_FAILURE_CODES.unavailable);
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
    async redirect({ url, baseUrl }) {
      const trustedBaseUrl = resolveAuthBaseUrl(baseUrl);
      return new URL(safeReturnPath(url, trustedBaseUrl), trustedBaseUrl).href;
    },

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
      try {
        if (!await resolveSessionUser(token)) {
          throw new Error("Session is no longer valid");
        }
        if (!token.sessionLookupUnavailable) return token;
        const recoveredToken = { ...token };
        delete recoveredToken.sessionLookupUnavailable;
        return recoveredToken;
      } catch (error) {
        if (error instanceof SessionLookupUnavailableError) {
          return { ...token, sessionLookupUnavailable: true };
        }
        throw error;
      }
    },

    async session({ session, token }) {
      if (!token || token.sessionLookupUnavailable) return null;
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
          const subject = typeof profile?.sub === "string" ? profile.sub : "";
          if (!email || profile?.email_verified !== true || !subject) return false;
          const userDB = await User.findOne({ email }).select("+password");
          if (!userDB) {
            const userData = await UserData.create({});
            try {
              await User.create({
                userName: name || email.split("@")[0],
                email,
                imageUrl: picture || "/icon-192x192.png",
                userData: userData._id,
                isVerified: true,
                googleSubject: subject,
              });
            } catch (error) {
              await UserData.deleteOne({ _id: userData._id }).catch(() => {});
              throw error;
            }
          } else {
            // Never activate a password registered by someone who did not own
            // the mailbox. Credential accounts require explicit provider linking.
            if (!userDB.isVerified) return false;
            if (userDB.googleSubject) {
              if (userDB.googleSubject !== subject) return false;
            } else {
              if (userDB.password) return false;
              // Migrate verified Google-only accounts from before subjects were
              // stored. The condition also prevents racing a password reset/link.
              const linked = await User.findOneAndUpdate({
                _id: userDB._id,
                isVerified: true,
                $and: [
                  { $or: [{ password: { $exists: false } }, { password: null }, { password: "" }] },
                  { $or: [{ googleSubject: { $exists: false } }, { googleSubject: null }] },
                ],
              }, { $set: { googleSubject: subject } }, { new: true });
              if (!linked) return false;
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
