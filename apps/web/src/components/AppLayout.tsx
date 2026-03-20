import { Link, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";

const menu = [
  { to: "/", label: "Painel" },
  { to: "/checklists", label: "Checklists" },
  { to: "/epi", label: "EPI" },
  { to: "/manutencao", label: "Manutenção" },
  { to: "/equipamentos", label: "Equipamentos" }
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3">
          <div>
            <h1 className="text-lg font-bold text-brand-800">SmartCheck</h1>
            <p className="text-xs text-slate-500">{user?.employee.name} - {user?.role}</p>
          </div>
          <button className="btn-secondary text-xs" onClick={logout}>Sair</button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-3">
          {menu.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
                location.pathname === item.to ? "bg-brand-700 text-white" : "bg-slate-200 text-slate-700"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-3">
        <Outlet />
      </main>
    </div>
  );
}
