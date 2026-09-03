"use client";

import { setProgress } from "@/redux/features/loadingBarSlice";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { signIn } from "next-auth/react";
import GradientText from "@/components/ReactBits/GradientText";
import AuthMessage from "@/components/AuthMessage";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { AUTH_CODES, validateEmail, validatePassword } from "@/utils/authErrors";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

const SignupPage = () => {
  const { status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    userName: "",
    email: "",
    password: "",
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [retryAction, setRetryAction] = useState(null);
  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) {
      setFormError(null);
      setRetryAction(null);
    }
  };
  const dispatch = useDispatch();

  const submitAccount = async () => {
    if (submitting || googleSubmitting) return;
    if (!formData.userName.trim()) {
      setFormError({ title: "Name required", message: "Please enter a username." });
      setRetryAction(null);
      return;
    }
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setFormError(emailError);
      setRetryAction(null);
      return;
    }
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setFormError(passwordError);
      setRetryAction(null);
      return;
    }
    try {
      setSubmitting(true);
      setRetryAction(null);
      dispatch(setProgress(70));
      const data = await requestJson("/api/signup", {
        method: "POST",
        body: {
          userName: formData.userName,
          email: formData.email,
          password: formData.password,
        },
        fallbackTitle: "Couldn't create account",
        fallbackMessage: "We couldn't create your account. Please try again.",
      });
      if (data?.success === true) {
        toast.success("Account created. Check your email to verify.");
        router.push("/login");
      } else {
        setFormError(AUTH_CODES.Default);
        setRetryAction(null);
      }
    } catch (error) {
      const details = userErrorDetails(error, {
        title: "Couldn't create account",
        message: "We couldn't create your account. Please try again.",
      });
      setFormError(details);
      setRetryAction(details.retryable ? "credentials" : null);
    } finally {
      setSubmitting(false);
      dispatch(setProgress(100));
    }
  };

  const handelSubmit = (e) => {
    e.preventDefault();
    void submitAccount();
  };

  const handleGoogleSignIn = async () => {
    if (submitting || googleSubmitting) return;
    setGoogleSubmitting(true);
    setFormError(null);
    setRetryAction(null);
    try {
      const result = await signIn("google", {
        callbackUrl: "/",
        redirect: false,
      });
      if (result?.error) {
        setFormError(userErrorDetails(result.error, AUTH_CODES.OAuthCreateAccount));
        setRetryAction(null);
        return;
      }
      if (!result?.url) throw new Error("Google sign-in did not return a redirect.");
      window.location.assign(result.url);
    } catch (error) {
      const details = userErrorDetails(error, AUTH_CODES.OAuthSignin);
      setFormError(details);
      setRetryAction(details.retryable ? "google" : null);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const retryRequest =
    retryAction === "google"
      ? handleGoogleSignIn
      : retryAction === "credentials"
        ? submitAccount
        : undefined;

  if (status === "loading") {
    return (
      <div className="page-loading" role="status" aria-label="Loading sign up">
        <span className="loader" aria-hidden="true" />
      </div>
    );
  }
  if (status === "authenticated") {
    redirect("/");
  }

  return (
    <div className="page grid min-h-full place-items-center relative z-10">
      <div className="auth-card animate-fade-in backdrop-blur-md bg-white/[0.02]">
        <p className="eyebrow">Join HeyKasa</p>
        <h1 className="mt-2 text-3xl font-bold">
          <GradientText
            colors={["#00e6e6", "#ffffff", "#008080", "#00e6e6"]}
            animationSpeed={4}
          >
            Create account
          </GradientText>
        </h1>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          Save favourites and build playlists across devices.
        </p>
        <form onSubmit={handelSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <AuthMessage
            id="signup-error"
            title={formError?.title}
            message={formError?.message}
            onRetry={retryRequest}
            busy={submitting || googleSubmitting}
            href="/login"
            hrefLabel="Log in instead"
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]" htmlFor="userName">
            Username
            <input
              onChange={onchange}
              value={formData.userName}
              type="text"
              placeholder="Your name"
              required
              autoComplete="username"
              maxLength={50}
              id="userName"
              name="userName"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? "signup-error" : undefined}
              className="field mt-2"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]" htmlFor="signup-email">
            Email
            <input
              onChange={onchange}
              value={formData.email}
              id="signup-email"
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              autoComplete="email"
              maxLength={254}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? "signup-error" : undefined}
              className="field mt-2"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]" htmlFor="signup-password">
            Password
            <input
              onChange={onchange}
              value={formData.password}
              id="signup-password"
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? "signup-error" : undefined}
              className="field mt-2"
            />
          </label>
          <button type="submit" disabled={submitting || googleSubmitting} className="btn-primary w-full">
            {submitting ? "Creating account..." : "Sign up"}
          </button>
          <GoogleSignInButton
            onClick={handleGoogleSignIn}
            disabled={submitting}
            busy={googleSubmitting}
          />
          <p className="text-center text-sm text-[#c9d4de]">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#00e6e6]">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignupPage;
