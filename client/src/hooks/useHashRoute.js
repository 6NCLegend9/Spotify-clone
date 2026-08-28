import { useEffect, useMemo, useState } from "react";
import { matchRoute } from "../routes";

const parseHash = () => {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pathPart, queryString = ""] = raw.split("?");
  const path = `/${pathPart.split("/").filter(Boolean).join("/")}` || "/";
  const query = Object.fromEntries(new URLSearchParams(queryString));
  return { path, query, ...matchRoute(path) };
};

export const useHashRoute = () => {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const update = () => setRoute(parseHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return useMemo(() => route, [route]);
};

export const navigate = (path) => {
  const destination = path.startsWith("#") ? path.slice(1) : path;
  window.location.hash = destination.startsWith("/") ? destination : `/${destination}`;
};
