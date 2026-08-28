import { createContext, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(null);

export function ToastHost({ toasts, dismiss }) {
  return <div className="toast-host" aria-live="polite" aria-atomic="true">
    {toasts.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id} role="status">
      <span>{toast.message}</span>
      <button aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>x</button>
    </div>)}
  </div>;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = (id) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const notify = (message, tone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), 4200));
  };

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  return <ToastContext.Provider value={{ notify }}>
    {children}
    <ToastHost toasts={toasts} dismiss={dismiss} />
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}