"use client";
import React, { useState } from "react";
import { signOut } from "next-auth/react";
import { store, persistor, RESET_STORE } from "@/redux/store";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";
import UserMessage from "@/components/UserMessage";

async function clearLocalAccountData() {
  // Stop persistence, reset the live Redux store, then wipe all browser storage.
  persistor.pause();
  store.dispatch({ type: RESET_STORE });
  await persistor.purge();

  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Storage may be unavailable (e.g., private browsing).
  }
}

export default function DeleteAccountForm() {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [statusMessage, setStatusMessage] = useState(null);

  const initiateDelete = () => {
    setStatusMessage(null);
    setShowConfirm(true);
  };

  const cancelDelete = () => {
    setShowConfirm(false);
    setConfirmText("");
    setStatusMessage(null);
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE") {
      setStatusMessage({
        title: "Confirmation required",
        message: "Type DELETE exactly to confirm account deletion.",
        retryable: false,
      });
      return;
    }

    setLoading(true);
    setStatusMessage({
      tone: "info",
      title: "Deleting your account",
      message: "Please keep this page open while we remove your data.",
    });
    try {
      const data = await requestJson("/api/deleteAccount", {
        method: "POST",
        fallbackTitle: "Couldn't delete account",
        fallbackMessage: "We couldn't delete your account. Please try again.",
      });
      if (data?.success !== true) throw new Error("Account deletion did not complete.");
    } catch (error) {
      const userError = userErrorDetails(error, {
        title: "Couldn't delete account",
        message: "We couldn't delete your account. Please try again.",
      });
      setStatusMessage(userError);
      setLoading(false);
      return;
    }

    setStatusMessage({
      tone: "success",
      title: "Account deleted",
      message: "Your account data was removed. Signing you out now.",
    });
    await clearLocalAccountData().catch(() => {});
    try {
      const result = await signOut({ callbackUrl: "/", redirect: false });
      window.location.replace(result?.url || "/");
    } catch {
      window.location.replace("/api/auth/signout?callbackUrl=%2F");
    }
  };

  if (showConfirm) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-red-500/50 bg-red-500/10 p-4">
        <p className="text-sm text-red-500 font-semibold">
          This action cannot be undone. To verify, please type <strong>DELETE</strong> below:
        </p>
        {statusMessage ? (
          <UserMessage
            tone={statusMessage.tone || "error"}
            title={statusMessage.title}
            message={statusMessage.message}
            onRetry={statusMessage.retryable ? handleDelete : undefined}
            retryLabel="Retry deletion"
            busy={loading}
          />
        ) : null}
        <input
          id="delete-account-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => {
            setConfirmText(e.target.value);
            if (!loading && statusMessage) setStatusMessage(null);
          }}
          placeholder="DELETE"
          autoComplete="off"
          aria-label="Type DELETE to confirm account deletion"
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={cancelDelete}
            disabled={loading}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            type="button"
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
      type="button"
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