"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { HiOutlineBell } from "react-icons/hi2";
import { IoClose } from "react-icons/io5";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { requestJson } from "@/services/http";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import { FOLLOWS_CHANGED_EVENT } from "@/utils/accountNotifications.mjs";

const GUEST_SEEN_KEY = "heykasa.notifications.seen";
const POLL_MS = 10 * 60 * 1000;
const VISIBILITY_THROTTLE_MS = 2 * 60 * 1000;

function formatWhen(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "";
  const delta = Date.now() - time;
  if (delta < 60_000) return "Just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(delta / 86_400_000);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(time).toLocaleDateString();
}

function actionLabel(type) {
  if (type === "release") return "Open artist";
  if (type === "follow") return "Find artists";
  if (type === "status") return "See following";
  if (type === "account") return "Sign in";
  return "Open";
}

function guestSeenIds() {
  try {
    const raw = window.localStorage.getItem(GUEST_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberGuestSeen(ids) {
  try {
    window.localStorage.setItem(GUEST_SEEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Private mode can block storage; the badge will return on reload.
  }
}

function applyLocalSeen(payload, seenIds) {
  const seen = new Set(seenIds);
  const items = (payload?.items || []).map((item) => ({
    ...item,
    unread: item.unread === true && !seen.has(item.id),
  }));
  return { items, unreadCount: items.filter((item) => item.unread).length };
}

function showDesktopAlert(item) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(item.title, {
      body: item.body,
      icon: item.image || "/icon-192x192.png",
      tag: item.id,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Browser notification support is optional.
  }
}

export default function UpdatesBell() {
  const { status } = useSession();
  const dispatch = useDispatch();
  const privateSession = useSelector((state) => state.settings?.privateSession === true);
  const browserNotifications = useSelector((state) => state.settings?.browserNotifications === true);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const knownUnreadRef = useRef(new Set());
  const lastCheckRef = useRef(0);
  const authenticated = status === "authenticated";

  useFocusTrap({
    enabled: open,
    onClose: () => setOpen(false),
    containerRef: panelRef,
  });
  useDismissOnOutside(open, () => setOpen(false), [panelRef, buttonRef]);

  const load = useCallback(async ({ announce = false } = {}) => {
    lastCheckRef.current = Date.now();
    try {
      const payload = await requestJson("/api/notifications", {
        retry: false,
        timeout: 12000,
        cache: "no-store",
        fallbackTitle: "Notifications unavailable",
        fallbackMessage: "Could not load your notifications.",
      });
      const next = applyLocalSeen(payload, authenticated ? [] : guestSeenIds());
      const nextUnread = next.items.filter((item) => item.unread && item.type === "release");
      if (announce && !privateSession) {
        const fresh = nextUnread.filter((item) => !knownUnreadRef.current.has(item.id));
        if (fresh.length === 1) {
          const item = fresh[0];
          toast(`${item.title} just dropped “${item.body}”.`);
          if (browserNotifications && document.visibilityState !== "visible") showDesktopAlert(item);
        } else if (fresh.length > 1) {
          toast(`${fresh.length} new songs from artists you follow.`);
          if (browserNotifications && document.visibilityState !== "visible") {
            showDesktopAlert({
              id: "release-batch",
              title: "New music on HayKasa",
              body: `${fresh.length} new songs from artists you follow.`,
              image: fresh[0].image,
            });
          }
        }
      }
      knownUnreadRef.current = new Set(nextUnread.map((item) => item.id));
      setItems(next.items);
      setUnreadCount(next.unreadCount);
    } catch {
      // Playback and navigation stay available if the inbox cannot refresh.
    } finally {
      setLoading(false);
    }
  }, [authenticated, browserNotifications, privateSession]);

  useEffect(() => {
    if (status === "loading") return undefined;
    let active = true;
    const run = (options) => {
      if (active) void load(options);
    };
    run({ announce: false });
    const interval = window.setInterval(() => run({ announce: true }), POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckRef.current < VISIBILITY_THROTTLE_MS) return;
      run({ announce: true });
    };
    const onFollowsChanged = () => run({ announce: false });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(FOLLOWS_CHANGED_EVENT, onFollowsChanged);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(FOLLOWS_CHANGED_EVENT, onFollowsChanged);
    };
  }, [load, status]);

  const markRead = async (ids) => {
    const unreadIds = ids.filter(Boolean);
    if (unreadIds.length === 0) return;
    setItems((current) => current.map((item) => (
      unreadIds.includes(item.id) ? { ...item, unread: false } : item
    )));
    setUnreadCount((count) => Math.max(0, count - unreadIds.length));
    unreadIds.forEach((id) => knownUnreadRef.current.delete(id));
    if (!authenticated) {
      rememberGuestSeen([...new Set([...guestSeenIds(), ...unreadIds])]);
      return;
    }
    try {
      await requestJson("/api/notifications/read", {
        method: "POST",
        body: { ids: unreadIds },
        fallbackTitle: "Could not update notifications",
        fallbackMessage: "Your inbox will refresh on the next check.",
      });
    } catch {
      // Local read state still updates so the badge does not stick.
    }
  };

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      const unreadIds = items.filter((item) => item.unread).map((item) => item.id);
      void markRead(unreadIds);
    }
  };

  const playItem = (item) => {
    if (!item?.playable?.id) return;
    dispatch(startYoutubePlayback({
      queue: [item.playable],
      track: item.playable,
      radio: false,
    }));
    setOpen(false);
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="icon-btn relative h-9 w-9 sm:h-10 sm:w-10"
        aria-label={hasUnread ? `Open notifications, ${unreadCount} unread` : "Open notifications"}
        title="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="updates-panel"
      >
        <HiOutlineBell aria-hidden="true" className="h-5 w-5" />
        {hasUnread ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#00e6e6] shadow-[0_0_0_2px_rgba(2,8,19,0.95)]">
            <span className="sr-only">{unreadCount} unread</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id="updates-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="updates-title"
            className="fixed right-3 top-[72px] z-50 w-[calc(100vw-1.5rem)] max-w-[26rem] overflow-hidden rounded-2xl border border-white/10 bg-[#07121d] text-white shadow-dock md:right-6"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 id="updates-title" className="text-lg font-semibold">Notifications</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-btn h-11 w-11"
                aria-label="Close notifications"
              >
                <IoClose aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
              {loading && items.length === 0 ? (
                <p className="text-sm leading-6 text-white/70">Checking for updates…</p>
              ) : items.length === 0 ? (
                <p className="text-sm leading-6 text-white/70">
                  {authenticated
                    ? "Nothing new right now. Follow artists to get release alerts here."
                    : "Sign in to get alerts when artists you follow drop new music."}
                </p>
              ) : items.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-xl border p-3.5 ${item.unread ? "border-[#00e6e6]/25 bg-[#00e6e6]/5" : "border-white/10 bg-white/5"}`}
                >
                  <div className="updates-item">
                    {item.image ? (
                      <img src={item.image} alt="" className="updates-item__art" />
                    ) : null}
                    <div className="updates-item__body">
                      <div className="updates-item__top">
                        <h3 className="updates-item__title">{item.title}</h3>
                        <p className="updates-item__when">{formatWhen(item.createdAt)}</p>
                      </div>
                      <p className="updates-item__copy">{item.body}</p>
                      <div className="updates-item__actions">
                        {item.playable?.id ? (
                          <button type="button" className="updates-action updates-action--play" onClick={() => playItem(item)}>
                            Play
                          </button>
                        ) : null}
                        {item.href ? (
                          <Link href={item.href} className="updates-action updates-action--link" onClick={() => setOpen(false)}>
                            {actionLabel(item.type)}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
