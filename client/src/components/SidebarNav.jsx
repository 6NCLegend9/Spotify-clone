import { navigate, useHashRoute } from "../hooks/useHashRoute";
import { Icon } from "./Icon";

const navigation = [
  { path: "/", label: "Home", icon: "home" },
  { path: "/search", label: "Search", icon: "search" },
  { path: "/library", label: "Your Library", icon: "library" },
  { path: "/library?tab=liked", label: "Liked Songs", icon: "heart" },
  { path: "/charts", label: "Charts", icon: "chart" },
];

export function SidebarNav({ onCreate, onNavigate }) {
  const { path, query } = useHashRoute();

  const visit = (destination) => {
    navigate(destination);
    onNavigate?.();
  };

  return <nav className="sidebar-nav" aria-label="Primary navigation">
    {navigation.map((item) => {
      const active = item.path === "/library?tab=liked" ? path === "/library" && query.tab === "liked" : path === item.path;
      return <button className={active ? "is-active" : ""} key={item.label} onClick={() => visit(item.path)}><Icon name={item.icon} /> <span>{item.label}</span></button>;
    })}
    <div className="sidebar-nav-divider" />
    <button onClick={() => { onCreate(); onNavigate?.(); }}><Icon name="plus" /> <span>Create playlist</span></button>
    <button className={path === "/settings" ? "is-active" : ""} onClick={() => visit("/settings")}><Icon name="settings" /> <span>Settings</span></button>
  </nav>;
}