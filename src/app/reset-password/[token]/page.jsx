"use client";

import { setProgress } from "@/redux/features/loadingBarSlice";
import { resetPassword } from "@/services/dataAPI";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";

const page = ({ params }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handelSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Password and Confirm Password are not same");
      return;
    }
    const { password, confirmPassword } = formData;
    try {
      dispatch(setProgress(70));
      const res = await resetPassword(password, confirmPassword, params.token);
      if (res.success === true) {
        toast.success("Password reset successfully");
        router.push("/login");
      } else {
        toast.error("Invalid Token");
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
        <h1 className="mt-2 text-3xl font-bold text-white">Reset password</h1>
        <form onSubmit={handelSubmit} className="mt-6 flex flex-col gap-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            New password
            <input
              onChange={onchange}
              value={formData.password}
              name="password"
              type="password"
              placeholder="New password"
              required
              className="field mt-2"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Confirm password
            <input
              onChange={onchange}
              value={formData.confirmPassword}
              name="confirmPassword"
              type="password"
              placeholder="Confirm password"
              required
              className="field mt-2"
            />
          </label>
          <button type="submit" className="btn-primary w-full">
            Save password
          </button>
        </form>
      </div>
    </div>
  );
};

export default page;
