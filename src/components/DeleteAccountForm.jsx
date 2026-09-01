"use client";
import React, { useState } from "react";
import toast from "react-hot-toast";

export default function DeleteAccountForm() {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to permanently delete your account and all associated data? This action cannot be undone.");
    if (!confirmDelete) return;

    setLoading(true);
    try {
      const res = await fetch("/api/deleteAccount", { method: "POST" });
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success("Account and data permanently deleted.");
      } else {
        toast.error(data.error || "Failed to process database deletion request.");
      }
    } catch (error) {
      toast.error("An internal server error occurred.");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className={`rounded-md bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 ${
        loading ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {loading ? "Deleting Data Server-Side..." : "Permanently Delete My Data"}
    </button>
  );
}