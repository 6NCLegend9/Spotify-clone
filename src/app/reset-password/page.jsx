"use client";

import { setProgress } from "@/redux/features/loadingBarSlice";
import { sendResetPasswordLink } from "@/services/dataAPI";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useDispatch } from "react-redux";
import Link from "next/link";

const page = () => {
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({ email: "" });

  const handelSubmit = async (e) => {
    e.preventDefault();
    try {
      dispatch(setProgress(70));
      const res = await sendResetPasswordLink(formData.email);
      if (res.success === true) {
        toast.success("Password reset link sent to your email");
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      toast.error(error?.message || "Something went wrong");
    } finally {
      dispatch(setProgress(100));
    }
  };

  return (
    <div className="page grid min-h-full place-items-center">
      <div className="auth-card">
        <p className="eyebrow">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Forgot password</h1>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          Enter your email and we will send a reset link.
        </p>
        <form onSubmit={handelSubmit} className="mt-6 flex flex-col gap-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Email
            <input
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              value={formData.email}
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              className="field mt-2"
            />
          </label>
          <button type="submit" className="btn-primary w-full">
            Send reset link
          </button>
          <Link href="/login" className="text-center text-sm font-semibold text-[#00e6e6]">
            Back to login
          </Link>
        </form>
      </div>
    </div>
  );
};

export default page;
