import React from "react";
import DeleteAccountForm from "@/components/DeleteAccountForm";

export default function PrivacyPage() {
  return (
    <main className="page text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
      
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">1. Information We Collect</h2>
        <p>We may collect personal information such as your email address when you register.</p>
      </section>
      
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">2. How We Use Information</h2>
        <p>We use the information we collect to operate, maintain, and provide the features of the service.</p>
      </section>
      
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">3. Data Deletion Request Workflow</h2>
        <p className="mb-4">If you wish to have your account and personal data permanently deleted, use the button below.</p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}