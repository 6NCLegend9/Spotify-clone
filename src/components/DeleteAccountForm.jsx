"use client";
import React, { useState } from "react";
import toast from "react-hot-toast";

export default function DeleteAccountForm() {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to request data deletion? This will alert our support team.");
    if (!confirmDelete) return;

    setLoading(true);
    try {
      const res = await fetch("/api/deleteAccount", { method: "POST" });
      if (res.ok) {
        toast.success("Account deletion request submitted to support.");
      } else {
        toast.error("Failed to submit request.");
      }
    } catch (error) {
      toast.error("An error occurred.");
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
      {loading ? "Processing..." : "Request Account Deletion"}
    </button>
  );
}