import { Link, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { roleLabels } from "../lib/constants";

const menu = [
  { to: "/", label: "Dashboard" },
  { to: "/funcionarios", label: "Funcionários" },
  { to: "/usuarios", label: "Usuários" },
  { to: "/epi", label: "EPI" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/checklists", label: "Checklists" },
  { to: "/manutencao", label: "Manutenção" }
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px,1fr]">
      <aside className="border-b border-slate-200 bg-brand-900 px-4 py-4 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-brand-800">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-200">SmartCheck</p>
          <h1 className="text-2xl font-extrabold">Operação Industrial</h1>
        </div>

        <div className="mb-5 rounded-xl bg-brand-800/70 p-3 text-sm">
          <p className="font-semibold">{user?.employee?.name ?? user?.email}</p>
          <p className="text-brand-200">{user ? roleLabels[user.role] : ""}</p>
        </div>

        <nav className="grid gap-2 lg:gap-1">
          {menu.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  active ? "bg-white text-brand-900" : "text-brand-50 hover:bg-brand-800"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button className="btn-secondary mt-6 w-full" onClick={logout}>
          Sair
        </button>
      </aside>

      <main className="p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
