export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AUTH_CODES = {
  CredentialsSignin: {
    title: "Couldn't sign in",
    message:
      "We couldn't sign you in with those details. Check the spelling, try again, or request a new password link.",
  },
  OAuthSignin: {
    title: "Google sign-in didn't start",
    message: "We couldn't start Google sign-in. Try again in a moment.",
  },
  OAuthCallback: {
    title: "Google sign-in didn't finish",
    message: "Google sign-in was interrupted. Try again, or use email instead.",
  },
  OAuthCreateAccount: {
    title: "Couldn't create account",
    message: "We couldn't create your account with Google. Please try again.",
  },
  OAuthAccountNotLinked: {
    title: "Email already in use",
    message:
      "This email is already registered. Log in with email and password, then connect Google from settings.",
  },
  AccessDenied: {
    title: "Access denied",
    message: "You don't have permission to sign in this way. Try a different method.",
  },
  Configuration: {
    title: "Sign-in is unavailable",
    message: "Sign-in is temporarily unavailable. Please try again later.",
  },
  Callback: {
    title: "Sign-in didn't complete",
    message: "Something went wrong while finishing sign-in. Please try again.",
  },
  SessionRequired: {
    title: "Please log in",
    message: "You need to be logged in to continue.",
  },
  EmailSignin: {
    title: "Email sign-in failed",
    message: "We couldn't send a sign-in email. Please try again.",
  },
  Default: {
    title: "Something went wrong",
    message: "Please try again. If it keeps happening, request a new password link.",
  },
};

const TECHNICAL_PATTERN =
  /CredentialsSignin|OAuthSignin|OAuthCallback|OAuthCreateAccount|OAuthAccountNotLinked|AccessDenied|Configuration|Callback|SessionRequired|EmailSignin|Mongo(Server)?Error|Mongoose|ECONN|ENOTFOUND|EAI_AGAIN|Internal Server Error|TypeError|SyntaxError|Unexpected token|Prisma|Cast to ObjectId|node_modules|fetch failed|at\s+\S+\s+\([^)]+:\d+:\d+\)|\bstack\b/i;

export class AuthError extends Error {
  constructor(message, { title = "Something went wrong", code = "Default" } = {}) {
    super(message);
    this.name = "AuthError";
    this.title = title;
    this.code = code;
  }
}

function decodeErrorText(value) {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function safeAuthText(value) {
  if (typeof value !== "string") return "";
  const text = decodeErrorText(value);
  if (!text || text.length > 180 || TECHNICAL_PATTERN.test(text)) return "";
  return text;
}

export function validateEmail(email) {
  const value = typeof email === "string" ? email.trim() : "";
  if (!value) {
    return {
      title: "Email required",
      message: "Please enter your email address.",
    };
  }
  if (!EMAIL_PATTERN.test(value) || value.length > 254) {
    return {
      title: "Invalid email",
      message: "Please enter a valid email address.",
    };
  }
  return null;
}

export function validatePassword(password, { confirm } = {}) {
  const value = typeof password === "string" ? password : "";
  if (!value) {
    return {
      title: "Password required",
      message: "Please enter your password.",
    };
  }
  if (value.length < 8) {
    return {
      title: "Password too short",
      message: "Use at least 8 characters.",
    };
  }
  if (value.length > 72) {
    return {
      title: "Password too long",
      message: "Passwords must be 72 characters or fewer.",
    };
  }
  if (confirm != null && value !== confirm) {
    return {
      title: "Passwords don't match",
      message: "The password and confirmation must be the same.",
    };
  }
  return null;
}

export function humanizeError(error, fallback = AUTH_CODES.Default) {
  const safeFallback = {
    title: safeAuthText(fallback?.title) || AUTH_CODES.Default.title,
    message: safeAuthText(fallback?.message) || AUTH_CODES.Default.message,
  };
  const structuredError =
    error
    && typeof error === "object"
    && !(error instanceof Error)
    && typeof error.message === "string";
  const raw =
    typeof error === "string"
      ? error
      : structuredError
        ? error
        : error?.message || error?.error || error?.code || "";

  if (raw && typeof raw === "object" && raw.message) {
    const title = safeAuthText(raw.title);
    const message = safeAuthText(raw.message);
    if (!message) return safeFallback;
    return {
      title: title || safeFallback.title,
      message,
    };
  }

  const text = decodeErrorText(raw);
  if (!text) return safeFallback;

  if (AUTH_CODES[text]) return AUTH_CODES[text];

  const knownMessages = [...Object.values(LOGIN_ERRORS), ...Object.values(RESET_ERRORS)];
  const known = knownMessages.find(
    (item) => text === item.message || text.startsWith(item.message.slice(0, 28)),
  );
  if (known) return known;

  const matchedCode = Object.keys(AUTH_CODES).find((code) =>
    text.toLowerCase().includes(code.toLowerCase()),
  );
  if (matchedCode) return AUTH_CODES[matchedCode];

  return safeFallback;
}

export const LOGIN_ERRORS = {
  emailNotFound: {
    title: "Email not found",
    message:
      "We couldn't find an account with that email. Please check the spelling or try requesting a new password link.",
  },
  wrongPassword: {
    title: "Incorrect password",
    message:
      "That password doesn't match this account. Try again, or request a new password link.",
  },
  googleOnly: {
    title: "Use Google to continue",
    message:
      "This account was created with Google. Continue with Google, or request a password link after setting a password.",
  },
  unverified: {
    title: "Verify your email",
    message: "Please verify your email before logging in. Check your inbox for the link.",
  },
  rateLimited: {
    title: "Too many attempts",
    message: "Too many login attempts. Please wait a few minutes and try again.",
  },
};

export const RESET_ERRORS = {
  emailNotFound: {
    title: "Check your email",
    message:
      "If an account matches that email, a reset link is on the way. It expires in 15 minutes.",
  },
  invalidEmail: {
    title: "Invalid email",
    message: "Please enter a valid email address.",
  },
  blankEmail: {
    title: "Email required",
    message: "Please enter your email address.",
  },
};
