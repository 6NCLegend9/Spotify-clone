"use client";

import { useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";

const Searchbar = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = searchTerm.trim();
    if (!query) return;
    router.push(`/search/${encodeURIComponent(query)}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="w-full max-w-xl"
    >
      <label htmlFor="search-field" className="sr-only">
        Search songs, artists, and playlists
      </label>
      <div className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 transition focus-within:border-[#00e6e6] focus-within:bg-[#07121d]/80 focus-within:shadow-glow">
        <FiSearch aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9aa8b5]" />
        <input
          id="search-field"
          name="search-field"
          type="search"
          autoComplete="off"
          placeholder="Search songs, artists, playlists"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => dispatch(setIsTyping(true))}
          onBlur={() => dispatch(setIsTyping(false))}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#9aa8b5]"
        />
      </div>
    </form>
  );
};

export default Searchbar;
