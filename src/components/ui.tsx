import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppointmentStatus } from "../lib/types";
import { STATUS_LABEL } from "../lib/format";

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="stack">{children}</div>
        {footer && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`badge st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Spinner({ label = "Carregando..." }: { label?: string }) {
  return <div className="muted center" style={{ padding: 24 }}>{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted center" style={{ padding: 24 }}>{children}</div>;
}

// ---------- Toasts ----------
type Toast = { id: number; text: string; kind: "success" | "error" | "info" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function confirmAction(msg: string): boolean {
  return window.confirm(msg);
}
