"use client";

import { Component } from "react";
import Link from "next/link";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(`${this.props.name || "UI"} boundary:`, error?.message || "Unknown render error");
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback({ reset: this.reset });
    }

    return (
      <div role="alert" className="rounded-2xl border border-amber-400/30 bg-[#07121d] p-5 text-white">
        <p className="text-sm font-semibold">{this.props.title || "This section stopped working"}</p>
        <p className="mt-1 text-sm text-[#9aa8b5]">
          {this.props.message || "Try loading it again. The rest of HeyKasa is still available."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={this.reset} className="btn-primary h-9 px-3 text-xs">
            Try again
          </button>
          <Link href="/" className="btn-ghost h-9 px-3 text-xs">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }
}
