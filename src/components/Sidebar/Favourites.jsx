import Link from "next/link";
import React from "react";
import { AiFillHeart } from "react-icons/ai";
import { FiDisc } from "react-icons/fi";

const Favourites = ({ setShowNav }) => {
  return (
    <div className="m-2 w-[95%] rounded-md pt-5 hover:bg-white/5">
      <Link
        href="/library"
        className="mb-4 flex cursor-pointer items-center"
        onClick={() => setShowNav(false)}
      >
        <p className="mx-3 font-semibold text-lg text-white">Your Library</p>
        <FiDisc title="Your Library" size={23} color="white" />
      </Link>
      <Link
        href="/library/liked"
        className="flex cursor-pointer items-center"
        onClick={() => setShowNav(false)}
      >
        <p className=" font-semibold text-lg text-white mx-3 mb-7">
          Liked Songs
        </p>
        <AiFillHeart
          title="Favourites"
          size={25}
          color={"white"}
          className={` mb-7 `}
        />
      </Link>
    </div>
  );
};

export default Favourites;
