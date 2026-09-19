"use client";

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { restorePlayback } from "@/redux/features/playerSlice";

export default function NotFoundPlaybackGuard() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(restorePlayback({ snapshot: null, owner: null }));
  }, [dispatch]);

  return null;
}
