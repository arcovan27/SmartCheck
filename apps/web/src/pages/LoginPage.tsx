import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRef } from "react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithChecklistToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const authenticationInProgress = useRef(false);

  useEffect(() => {
    const checklistToken = searchParams.get("checklistToken");
    if (!checklistToken || authenticationInProgress.current) return;

    authenticationInProgress.current = true;
    setError("");
    setLoading(true);
    loginWithChecklistToken(checklistToken)
      .then(() => navigate("/execucao-checklist", { replace: true }))
      .catch((err) => setError(err instanceof Error ? err.message : "Link invalido ou expirado"))
      .finally(() => {
        authenticationInProgress.current = false;
        setLoading(false);
      });
  }, [searchParams, loginWithChecklistToken, navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (authenticationInProgress.current) return;

    authenticationInProgress.current = true;
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      authenticationInProgress.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#f4f7fb] lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative isolate overflow-hidden bg-[#071b38] px-5 py-6 text-white sm:px-10 sm:py-9 lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-between lg:px-[clamp(3rem,5vw,6.5rem)] lg:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-80">
          <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -left-10 -top-12 h-56 w-56 rounded-full border border-[#60a5fa]/20" />
          <div className="absolute bottom-[-12rem] right-[-9rem] h-[30rem] w-[30rem] rotate-12 rounded-[5rem] border border-white/[0.06]" />
          <div className="absolute bottom-16 right-16 hidden h-28 w-28 rotate-45 border border-[#60a5fa]/15 lg:block" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(59,130,246,0.15),transparent_28%),linear-gradient(145deg,transparent_45%,rgba(15,54,97,0.65))]" />
        </div>

        <div>
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-[#60a5fa]" />
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-[#93c5fd] sm:text-xs">Ambiente corporativo</p>
          </div>
          <p className="mt-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white sm:text-base">SmartCheck Arcovan</p>

          <div className="mt-8 hidden max-w-2xl sm:block lg:mt-[clamp(3rem,8vh,7rem)]">
            <h1 className="max-w-xl text-[clamp(2.5rem,4.2vw,4.75rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
              Gestão que conecta toda a operação.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-300 lg:text-lg lg:leading-8">
              Processos, pessoas e indicadores reunidos em um só ambiente para ampliar o controle, a segurança e a eficiência da operação.
            </p>
          </div>
        </div>

        <div className="mt-8 hidden sm:block lg:mt-10">
          <ul className="grid max-w-2xl gap-3 text-sm text-slate-200 md:grid-cols-3 lg:gap-5" aria-label="Benefícios da plataforma">
            {["Operação integrada", "Dados em tempo real", "Decisões mais seguras"].map((benefit) => (
              <li className="flex items-center gap-2.5 border-t border-white/15 pt-3" key={benefit}>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1d4f83] text-[#bfdbfe]" aria-hidden="true">
                  <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none"><path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span className="font-semibold">{benefit}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[0.65rem] font-semibold uppercase tracking-[0.23em] text-slate-400 lg:mt-12">Arcovan · Soluções de Concreto</p>
        </div>
      </section>

      <section className="flex min-h-[calc(100dvh-7.4rem)] flex-col items-center justify-center px-4 py-7 sm:min-h-0 sm:px-8 sm:py-10 lg:min-h-[100dvh] lg:px-[clamp(2.5rem,5vw,6rem)]">
        <div className="w-full max-w-[31rem]">
          <div className="mb-5 flex justify-center sm:mb-7">
            <img className="h-auto w-[min(15rem,72vw)] object-contain sm:w-64" src="/arcovan-logo.png" alt="Arcovan Soluções de Concreto" />
          </div>

          <form
            className="rounded-[1.75rem] border border-slate-200/90 bg-white p-5 shadow-[0_24px_70px_rgba(15,35,64,0.10)] sm:p-8 lg:p-9"
            onSubmit={onSubmit}
            aria-busy={loading}
          >
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#316b9d]">Acesso ao sistema</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0b2341] sm:text-3xl">Bem-vindo de volta</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Entre com seus dados corporativos para continuar.</p>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700" htmlFor="login-email">E-mail corporativo</label>
                <input
                  id="login-email"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#316b9d] focus:ring-4 focus:ring-[#316b9d]/15"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nome@empresa.com.br"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700" htmlFor="login-password">Senha</label>
                <div className="relative mt-2">
                  <input
                    id="login-password"
                    className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-14 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#316b9d] focus:ring-4 focus:ring-[#316b9d]/15"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={loading}
                    required
                  />
                  <button
                    className="absolute inset-y-0 right-0 grid min-h-12 min-w-12 place-items-center rounded-r-xl text-slate-500 outline-none transition hover:text-[#123e68] focus-visible:ring-4 focus-visible:ring-[#316b9d]/20"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none"><path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.3A10.6 10.6 0 0 1 12 4c5.5 0 9 6 9 6a16.4 16.4 0 0 1-2.1 2.8M6.6 6.6C4.3 8.1 3 10 3 10s3.5 6 9 6a9.8 9.8 0 0 0 3.4-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" aria-live="assertive">{error}</p>}

            <button
              className="mt-5 min-h-12 w-full rounded-xl bg-[#0b2a4e] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(11,42,78,0.22)] outline-none transition hover:bg-[#123e68] focus-visible:ring-4 focus-visible:ring-[#316b9d]/30 disabled:cursor-not-allowed disabled:opacity-65 motion-reduce:transition-none"
              type="submit"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar no SmartCheck"}
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-emerald-600" fill="none"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <span>Ambiente seguro</span>
            </div>
          </form>

          <aside className="mt-4 rounded-2xl border border-slate-200/80 bg-white/65 px-4 py-3 text-center text-xs leading-5 text-slate-500 sm:mt-5 sm:text-sm">
            Precisa de ajuda para acessar? Procure o administrador do sistema.
          </aside>

          <footer className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.68rem] font-medium text-slate-400 sm:justify-between sm:text-xs">
            <span>© 2026 Arcovan</span>
            <span aria-hidden="true" className="sm:hidden">·</span>
            <span>SmartCheck · Gestão Industrial</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
