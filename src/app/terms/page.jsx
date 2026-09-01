import React from "react";

export default function TermsPage() {
  return (
    <main className="page text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
      <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">1. Acceptance of Terms</h2>
        <p>By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.</p>
      </section>
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">2. Description of Service</h2>
        <p>HeyKasa provides music streaming and related services.</p>
      </section>
       <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">3. User Conduct</h2>
        <p>You must not use the service for any illegal or unauthorized purpose.</p>
      </section>
    </main>
  );
}