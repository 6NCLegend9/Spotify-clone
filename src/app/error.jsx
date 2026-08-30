"use client";

const error = () => {
  return (
    <div className="page grid min-h-full place-items-center text-center text-white">
      <div>
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-bold">Try again</h1>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          The page failed to load. Refresh or head back home.
        </p>
        <a href="/" className="btn-primary mt-6">
          Back to Home
        </a>
      </div>
    </div>
  );
};

export default error;
