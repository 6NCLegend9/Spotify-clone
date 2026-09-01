import React from "react";
import Link from "next/link";

export default function AccessibilityPage() {
  return (
    <main className="page text-white">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Inclusion</p>
          <h1 className="mt-2 text-3xl font-bold">Accessibility</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#9aa8b5]">
            Last updated {new Date().toLocaleDateString()}. HeyKasa is built to work with keyboard, screen readers, and reduced-motion settings.
          </p>
        </div>
      </header>

      <section className="mb-8 max-w-3xl space-y-4 text-sm leading-6 text-[#c9d4de]">
        <h2 className="text-xl font-semibold text-white">Our commitment</h2>
        <p>
          We aim to meet WCAG 2.2 AA where practical: labeled form fields, visible focus, captions-friendly player controls, and error text that a person can read—not codes like CredentialsSignin.
        </p>
      </section>

      <section className="mb-8 max-w-3xl space-y-4 text-sm leading-6 text-[#c9d4de]">
        <h2 className="text-xl font-semibold text-white">Keyboard and screen readers</h2>
        <p>
          Use Tab and Shift+Tab to move through links, buttons, and fields. Menus close with Escape. Form errors are announced as alerts and include a “Try again” action.
        </p>
      </section>

      <section className="mb-8 max-w-3xl space-y-4 text-sm leading-6 text-[#c9d4de]">
        <h2 className="text-xl font-semibold text-white">Motion</h2>
        <p>
          If your device asks to reduce motion, HeyKasa shortens or disables decorative animation so the interface stays still and fast.
        </p>
      </section>

      <p className="text-sm text-[#9aa8b5]">
        Need help? <Link href="/login" className="text-[#00e6e6]">Log in</Link> or return <Link href="/" className="text-[#00e6e6]">home</Link>.
      </p>
    </main>
  );
}
