/** Versão "arquivo único" (abre direto do computador, sem hospedagem) usa rotas com # */
export const HASH_MODE = import.meta.env.VITE_HASH_ROUTER === "1";

/** Endereço completo de uma rota do site, para colocar em mensagens. */
export function appUrl(path: string): string {
  return HASH_MODE ? `${location.href.split("#")[0]}#${path}` : `${location.origin}${path}`;
}

/** URL de retorno dos e-mails do Supabase. No arquivo local usa a Site URL do projeto. */
export function redirectUrl(path: string): string | undefined {
  return HASH_MODE ? undefined : `${location.origin}${path}`;
}
