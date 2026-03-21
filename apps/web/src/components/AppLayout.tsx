import { Link, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { roleLabels } from "../lib/constants";

const dashboardMenu = [{ to: "/", label: "Dashboard" }];

const cadastroMenu = [
  { to: "/funcionarios", label: "Funcionários" },
  { to: "/epi", label: "EPI" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/checklists", label: "Checklists" },
  { to: "/manutencao", label: "Manutenção" }
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f7fa_0%,#e8edf3_100%)] lg:grid lg:grid-cols-[320px,1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-slate-800">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">SmartCheck</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">Operação Industrial</h1>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campo Usuário Logado</p>
          <p className="mt-3 text-lg font-bold text-white">{user?.employee?.name ?? user?.email}</p>
          <p className="mt-1 text-slate-300">Nível Exp: {user ? roleLabels[user.role] : ""}</p>
        </div>

        <div className="space-y-6">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Dashboard</p>
            <nav className="grid gap-2">
              {dashboardMenu.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      active
                        ? "border-cyan-400 bg-cyan-400 text-slate-950"
                        : "border-slate-800 bg-slate-900 text-slate-100 hover:border-slate-700 hover:bg-slate-800"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Cadastro</p>
            <nav className="grid gap-2">
              {cadastroMenu.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      active
                        ? "border-cyan-400 bg-cyan-400 text-slate-950"
                        : "border-slate-800 bg-slate-900 text-slate-100 hover:border-slate-700 hover:bg-slate-800"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </section>
        </div>

        <button
          className="btn-secondary mt-8 w-full border border-slate-700 bg-slate-100 text-slate-900 hover:bg-white"
          onClick={logout}
        >
          Sair
        </button>
      </aside>

      <main className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
