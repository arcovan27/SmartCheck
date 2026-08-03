import { Link, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useAuth, userHasPermission } from "../lib/auth";
import { apiRequest } from "../lib/api";
import { roleLabels } from "../lib/constants";
import { hrFeatures } from "../config/hrFeatures";

const dashboardMenu = [
  { to: "/", label: "Dashboard" },
  { to: "/execucao-checklist", label: "Execucao de Checklist" },
  { to: "/historico-checklist", label: "Historico de Checklist" },
  { to: "/downloads", label: "Downloads" }
];

const cadastroMenu = [
  { to: "/empresa", label: "Empresa" },
  { to: "/funcionarios", label: "Funcionarios", permission: "EMPLOYEE_VIEW" },
  { to: "/epi", label: "EPI", permission: "EPI_VIEW" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/checklists", label: "Modelos de Checklist" },
  { to: "/manutencao", label: "Manutencao" }
];

const recursosHumanosMenu = [
  { to: "/recursos-humanos", label: "Pulso do RH" },
  { to: "/recursos-humanos/funcionarios", label: "Funcionarios" },
  { to: "/recursos-humanos/indicadores-ocorrencias", label: "Ocorrencias" },
  { to: "/recursos-humanos/escalas", label: "Escala de trabalho" },
  { to: "/recursos-humanos/cadastros", label: "Cadastro" }
];

const epiMenu = [
  { to: "/recursos-humanos/epi", label: "Dashboard de EPI", permission: "EPI_VIEW" },
  { to: "/recursos-humanos/epi/ficha-entrega", label: "Ficha de entrega", permission: "EPI_MANAGE" },
  { to: "/recursos-humanos/epi/movimentacoes", label: "Movimentações", permission: "EPI_VIEW" },
  { to: "/recursos-humanos/epi/historico", label: "Histórico", permission: "EPI_VIEW" }
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const isChecklistOnly = Boolean(user?.checklistOnly);
  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: () => apiRequest<any>("/company"),
    enabled: !isChecklistOnly
  });
  const companyName = companyQuery.data?.tradeName || companyQuery.data?.legalName || "";
  const visibleDashboardMenu = isChecklistOnly
    ? [
        { to: "/execucao-checklist", label: "Execucao de Checklist" },
        { to: "/historico-checklist", label: "Historico de Checklist" }
      ]
    : dashboardMenu;
  const visibleCadastroMenu =
    (user?.role === "ADMIN" ? cadastroMenu : cadastroMenu.filter((item) => item.to !== "/checklists"))
      .filter((item) => !("permission" in item) || !item.permission || userHasPermission(user, item.permission));
  const visibleHrMenu = recursosHumanosMenu.filter((item) => {
    const permissionByRoute: Record<string, string> = {
      "/recursos-humanos": "HR_DASHBOARD_VIEW",
      "/recursos-humanos/epi": "EPI_VIEW",
      "/recursos-humanos/funcionarios": "EMPLOYEE_VIEW",
      "/recursos-humanos/indicadores-ocorrencias": "OCCURRENCE_VIEW",
      "/recursos-humanos/escalas": "SCHEDULE_VIEW",
      "/recursos-humanos/cadastros": "CATALOG_MANAGE"
    };
    if (item.to === "/recursos-humanos/escalas" && !hrFeatures.workScheduleEnabled) return false;
    if (item.to === "/recursos-humanos/cadastros") return userHasPermission(user, "CATALOG_MANAGE") || userHasPermission(user, "DEPARTMENT_VIEW");
    return userHasPermission(user, permissionByRoute[item.to]);
  });
  const visibleEpiMenu = epiMenu.filter((item) => userHasPermission(user, item.permission));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f7fa_0%,#e8edf3_100%)] lg:grid lg:grid-cols-[320px,1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-slate-800">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">SmartCheck</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">Operacao Industrial</h1>
          {companyName ? <p className="mt-2 text-sm font-medium text-slate-300">{companyName}</p> : null}
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
          <p className="text-lg font-bold text-white">{user?.employee?.name ?? user?.email}</p>
          <p className="mt-1 text-slate-300">{user ? roleLabels[user.role] : ""}</p>
        </div>

        <div className="space-y-6">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {isChecklistOnly ? "Checklist" : "Dashboard"}
            </p>
            <nav className="grid gap-2">
              {visibleDashboardMenu.map((item) => {
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

          {!isChecklistOnly && (visibleHrMenu.length > 0 || visibleEpiMenu.length > 0) && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                Recursos Humanos
              </p>
              <nav className="grid gap-2">
                {visibleEpiMenu.length > 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-2">
                    <p className="px-2 py-1 text-xs font-bold uppercase tracking-[0.16em] text-brand-300">EPI</p>
                    <div className="mt-1 grid gap-1">
                      {visibleEpiMenu.map((item) => {
                        const active = location.pathname === item.to;
                        return (
                          <Link key={item.to} to={item.to} className={clsx("rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-brand-300 text-slate-950" : "text-slate-200 hover:bg-slate-800 hover:text-white")}>
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {visibleHrMenu.map((item) => {
                  const active =
                    item.to === "/recursos-humanos"
                      ? location.pathname === item.to
                      : location.pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={clsx(
                        "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        active
                          ? "border-brand-300 bg-brand-300 text-slate-950"
                          : "border-slate-800 bg-slate-900 text-slate-100 hover:border-brand-700 hover:bg-slate-800"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </section>
          )}

          {!isChecklistOnly && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Cadastro</p>
              <nav className="grid gap-2">
                {visibleCadastroMenu.map((item) => {
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
          )}
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
