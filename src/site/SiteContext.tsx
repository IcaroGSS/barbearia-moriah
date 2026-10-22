import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { BlockedDate, BusinessHour, Service, Settings } from "../lib/types";
import { DEFAULT_HOURS, DEFAULT_SERVICES, DEFAULT_SETTINGS } from "../config/defaults";
import { todayISO } from "../lib/format";

type SiteData = {
  settings: Settings;
  services: Service[];
  hours: BusinessHour[];
  blocked: BlockedDate[];
  loading: boolean;
  /** true quando os dados vieram do banco (e não dos valores padrão) */
  fromDb: boolean;
  reload: () => Promise<void>;
  /** Pré-visualização de tema (painel de configurações) */
  previewTheme: (tema: string | null) => void;
};

const Ctx = createContext<SiteData | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<BusinessHour[]>(DEFAULT_HOURS);
  const [blocked, setBlocked] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDb, setFromDb] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const hoje = todayISO();
    const [s, sv, h, b] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("services").select("*").eq("ativo", true).order("ordem").order("nome"),
      supabase.from("business_hours").select("*").order("dia_semana"),
      supabase.from("blocked_dates").select("*").gte("data", hoje).order("data"),
    ]);
    if (s.data) {
      const db = s.data as Settings;
      setSettings({ ...DEFAULT_SETTINGS, ...db, textos: { ...DEFAULT_SETTINGS.textos, ...(db.textos ?? {}) } });
      setFromDb(true);
    }
    // Valores do arquivo de config só entram se o banco não responder
    if (sv.data && !sv.error) setServices((sv.data as Service[]).map((x) => ({ ...x, preco: Number(x.preco) })));
    else setServices(DEFAULT_SERVICES);
    if (h.data && h.data.length) setHours(h.data as BusinessHour[]);
    if (b.data) setBlocked(b.data as BlockedDate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const tema = preview ?? settings.tema;
  useEffect(() => {
    document.documentElement.dataset.theme = tema || "ouro";
  }, [tema]);

  useEffect(() => {
    if (!preview) document.title = settings.nome;
  }, [settings.nome, preview]);

  return (
    <Ctx.Provider value={{ settings, services, hours, blocked, loading, fromDb, reload, previewTheme: setPreview }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSite(): SiteData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSite fora do SiteProvider");
  return v;
}
