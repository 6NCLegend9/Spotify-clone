import React from "react";

export default function AccessibilityPage() {
  return (
    <main className="page text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Accessibility Statement</h1>
      <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
      
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Our Commitment</h2>
        <p>We are committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone, and applying the relevant accessibility standards, including WCAG compliance.</p>
      </section>
      
      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Keyboard Navigation</h2>
        <p>This website is designed to be navigable using a keyboard. You can use the Tab key to move through links and interactive elements.</p>
      </section>
    </main>
  );
}