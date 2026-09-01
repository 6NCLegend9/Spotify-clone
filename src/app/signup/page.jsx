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
import { FaGoogle } from "react-icons/fa";
import GradientText from "@/components/ReactBits/GradientText";
import AuthMessage from "@/components/AuthMessage";
import { humanizeError, validateEmail, validatePassword } from "@/utils/authErrors";

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
  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) setFormError(null);
  };
  const dispatch = useDispatch();

  const handelSubmit = async (e) => {
    e.preventDefault();
    if (!formData.userName.trim()) {
      setFormError({ title: "Name required", message: "Please enter a username." });
      return;
    }
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setFormError(emailError);
      return;
    }
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    try {
      setSubmitting(true);
      dispatch(setProgress(70));
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: formData.userName,
          email: formData.email,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (data.success === true) {
        toast.success("Account created. Check your email to verify.");
        router.push("/login");
      } else {
        setFormError({
          title: data?.title || "Couldn't create account",
          message: humanizeError(data).message,
        });
      }
    } catch (error) {
      setFormError(humanizeError(error));
    } finally {
      setSubmitting(false);
      dispatch(setProgress(100));
    }
  };

  if (status === "loading") {
    return (
      <div className="page-loading">
        <span className="loader" />
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
            title={formError?.title}
            message={formError?.message}
            onRetry={() => setFormError(null)}
            href="/login"
            hrefLabel="Log in instead"
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Username
            <input
              onChange={onchange}
              value={formData.userName}
              type="text"
              placeholder="Your name"
              required
              autoComplete="name"
              maxLength={50}
              id="userName"
              name="userName"
              className="field mt-2"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Email
            <input
              onChange={onchange}
              value={formData.email}
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              autoComplete="email"
              maxLength={254}
              className="field mt-2"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Password
            <input
              onChange={onchange}
              value={formData.password}
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              className="field mt-2"
            />
          </label>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Creating account..." : "Sign up"}
          </button>
          <div className="flex items-center gap-3 text-xs text-[#9aa8b5]">
            <span className="h-px flex-1 bg-white/15" />
            or
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <button
            onClick={() => signIn("google")}
            type="button"
            className="btn-ghost w-full"
          >
            <FaGoogle />
            Continue with Google
          </button>
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
