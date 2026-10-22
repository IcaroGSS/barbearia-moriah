import { supabase } from "./supabase";

const VISITOR_KEY = "moriah_visitante";
const SEEN_KEY = "moriah_paginas_vistas";

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Id anônimo gerado no navegador (não identifica a pessoa). */
function visitorId(): string {
  const ls = storage("local");
  let id = ls?.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    ls?.setItem(VISITOR_KEY, id);
  }
  return id;
}

/** Registra um page_view uma única vez por sessão do navegador para cada página. */
export async function trackPageView(pagina: string) {
  const ss = storage("session");
  let vistas: string[] = [];
  try {
    vistas = JSON.parse(ss?.getItem(SEEN_KEY) ?? "[]");
  } catch {
    vistas = [];
  }
  if (vistas.includes(pagina)) return;
  vistas.push(pagina);
  ss?.setItem(SEEN_KEY, JSON.stringify(vistas));

  const mobile = window.matchMedia?.("(max-width: 820px)").matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);
  let origem = "";
  try {
    origem = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer.slice(0, 500) : "";
  } catch {
    origem = "";
  }
  await supabase.from("page_views").insert({
    pagina,
    sessao_id: visitorId(),
    origem,
    dispositivo: mobile ? "mobile" : "desktop",
  });
}
