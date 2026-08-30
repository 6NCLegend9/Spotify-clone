"use client";

import { setProgress } from "@/redux/features/loadingBarSlice";
import { sendResetPasswordLink } from "@/services/dataAPI";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useDispatch } from "react-redux";
import Link from "next/link";
import { SpotlightCard } from "@/components/ReactBits/SpotlightCard";

const ForgotPasswordPage = () => {
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({ email: "" });

  const handelSubmit = async (e) => {
    e.preventDefault();
    try {
      dispatch(setProgress(70));
      const res = await sendResetPasswordLink(formData.email);
      if (res?.success === true) {
        toast.success("Password reset link sent to your email");
      } else {
        toast.error(res?.message || "Unable to send a reset link right now.");
      }
    } catch (error) {
      toast.error(error?.message || "Something went wrong");
    } finally {
      dispatch(setProgress(100));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000814] px-4 py-12 sm:px-6 lg:px-8">
      <SpotlightCard className="w-full max-w-md space-y-8 bg-[#07121d]">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-[#00e6e6] uppercase">Account recovery</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white mb-2">Forgot password</h1>
          <p className="mt-4 text-sm text-[#9aa8b5]">
            Enter your email and we will send a reset link.
          </p>
        </div>
        <form onSubmit={handelSubmit} className="mt-8 flex flex-col gap-6">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5] ml-1">
              Email Address
            </label>
            <input
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              value={formData.email}
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              autoComplete="email"
              maxLength={254}
              className="mt-2 w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 focus:border-[#00e6e6] focus:outline-none focus:ring-1 focus:ring-[#00e6e6] sm:text-sm"
            />
          </div>
          <button type="submit" className="w-full rounded-full bg-[#00e6e6] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#00c2c2] shadow-[0_0_15px_rgba(0,230,230,0.4)]">
            Send reset link
          </button>
          <div className="text-center mt-2">
            <Link href="/login" className="text-sm font-semibold text-[#00e6e6] hover:text-[#00c2c2] transition">
              Back to login
            </Link>
          </div>
        </form>
      </SpotlightCard>
    </div>
  );
};

export default ForgotPasswordPage;
