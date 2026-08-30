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

const page = () => {
  const { status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    userName: "",
    email: "",
    password: "",
  });
  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const dispatch = useDispatch();

  const handelSubmit = async (e) => {
    e.preventDefault();
    try {
      dispatch(setProgress(70));
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: formData.userName,
          email: formData.email,
          password: formData.password,
          imageUrl: `https://api.dicebear.com/6.x/thumbs/svg?seed=${formData.userName}`,
        }),
      });
      const data = await res.json();
      if (data.success === true) {
        toast.success("Account created successfully");
        router.push("/login");
      } else {
        toast.error(data?.message);
      }
    } catch (error) {
      toast.error(error?.message);
    } finally {
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
      <div className="auth-card backdrop-blur-md bg-white/[0.02]">
        <p className="eyebrow">Join Hayasaka</p>
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
        <form onSubmit={handelSubmit} className="mt-6 flex flex-col gap-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Username
            <input
              onChange={onchange}
              value={formData.userName}
              type="text"
              placeholder="Your name"
              required
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
              className="field mt-2"
            />
          </label>
          <button type="submit" className="btn-primary w-full">
            Sign up
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

export default page;
