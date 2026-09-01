"use client";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { signOut } from "next-auth/react";
import { persistor } from "@/redux/store";

const LOCAL_ACCOUNT_STORAGE_KEYS = [
  "songHistory",
  "autoAdd",
  "heykasa-accessibility-preferences",
];

async function clearLocalAccountData() {
  persistor.pause();
  await persistor.purge();

  for (const storageKey of LOCAL_ACCOUNT_STORAGE_KEYS) {
    window.localStorage.removeItem(storageKey);
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const storageKey = window.sessionStorage.key(index);
    if (storageKey?.startsWith("HeyKasa-home-recommendations:")) {
      window.sessionStorage.removeItem(storageKey);
    }
  }
}

export default function DeleteAccountForm() {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const initiateDelete = () => {
    setShowConfirm(true);
  };

  const cancelDelete = () => {
    setShowConfirm(false);
    setConfirmText("");
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/deleteAccount", { method: "POST" });
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success("Account and data permanently deleted.");
        await clearLocalAccountData();
        await signOut({ callbackUrl: "/", redirect: false });
        window.location.assign("/");
        return;
      } else {
        toast.error(data.message || data.error || "We couldn't delete your account. Please try again.");
      }
    } catch (error) {
      toast.error("An internal server error occurred.");
    }
    setLoading(false);
    setShowConfirm(false);
  };

  if (showConfirm) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-red-500/50 bg-red-500/10 p-4">
        <p className="text-sm text-red-500 font-semibold">
          This action cannot be undone. To verify, please type <strong>DELETE</strong> below:
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={cancelDelete}
            disabled={loading}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || confirmText !== "DELETE"}
            className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 ${
              (loading || confirmText !== "DELETE") ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {loading ? "Deleting Data..." : "Confirm Deletion"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={initiateDelete}
      disabled={loading}
      className={`rounded-md bg-red-600/10 border border-red-600/50 px-4 py-2 text-sm font-semibold text-red-500 transition hover:bg-red-600 hover:text-white ${
        loading ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      {loading ? "Processing..." : "Permanently Delete My Data"}
    </button>
  );
}