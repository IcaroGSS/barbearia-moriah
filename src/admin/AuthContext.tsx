import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Mensagem mostrada na tela de login (ex.: acesso pendente ou bloqueado) */
  notice: string | null;
  setNotice: (m: string | null) => void;
  refreshProfile: () => Promise<Profile | null>;
  signOut: (notice?: string) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export const MSG_PENDENTE = "Seu acesso está aguardando aprovação do responsável.";
export const MSG_BLOQUEADO = "Seu acesso foi bloqueado. Fale com o responsável pela barbearia.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const touched = useRef<string | null>(null);

  const signOut = useCallback(async (msg?: string) => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    if (msg) setNotice(msg);
  }, []);

  const loadProfile = useCallback(
    async (s: Session | null): Promise<Profile | null> => {
      if (!s) {
        setProfile(null);
        return null;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
      const p = (data as Profile | null) ?? null;
      if (!p) {
        setProfile(null);
        return null;
      }
      // Pendente ou bloqueado: não entra no painel
      if (p.status !== "aprovado") {
        await signOut(p.status === "pendente" ? MSG_PENDENTE : MSG_BLOQUEADO);
        return p;
      }
      setProfile(p);
      if (touched.current !== p.id) {
        touched.current = p.id;
        supabase.rpc("touch_last_access").then(() => {});
      }
      return p;
    },
    [signOut],
  );

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        touched.current = null;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // fora do callback para não travar o cliente do Supabase
        setTimeout(() => loadProfile(s), 0);
      }
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Se o dono bloquear o usuário, a sessão é encerrada na hora
  useEffect(() => {
    if (!profile) return;
    const canal = supabase
      .channel(`perfil-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          signOut("Seu acesso foi removido.");
          return;
        }
        const novo = payload.new as Profile;
        if (novo.status !== "aprovado") signOut(novo.status === "bloqueado" ? MSG_BLOQUEADO : MSG_PENDENTE);
        else setProfile(novo);
      })
      .subscribe();
    // Garantia extra caso o realtime caia: confere o status a cada minuto
    const timer = setInterval(async () => {
      const { data, error } = await supabase.from("profiles").select("status").eq("id", profile.id).maybeSingle();
      if (error) return;
      if (!data) signOut("Seu acesso foi removido.");
      else if (data.status !== "aprovado") signOut(data.status === "bloqueado" ? MSG_BLOQUEADO : MSG_PENDENTE);
    }, 60_000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(timer);
    };
  }, [profile?.id, signOut]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return loadProfile(data.session);
  }, [loadProfile]);

  return (
    <Ctx.Provider value={{ session, profile, loading, notice, setNotice, refreshProfile, signOut }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}
