import { Link, Outlet, useLocation, useNavigationType } from "react-router-dom";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useAuth, userHasPermission } from "../lib/auth";
import { apiRequest, getApiUrl } from "../lib/api";
import { roleLabels } from "../lib/constants";
import { useEffect, useMemo, useRef, useState } from "react";
import { procurementFeatures } from "../config/procurementFeatures";
import { visualFeatures } from "../config/visualFeatures";
import { AreaIdentity, BrandLogo, type BusinessArea } from "./BrandIdentity";

const dashboardMenu = [
  { to: "/gestao-arcovan", label: "Dashboard", permission: "GESTAO_ARCOVAN_VIEW" },
  { to: "/gestao-arcovan/historico-checklist", label: "Histórico de checklist", permission: "GESTAO_ARCOVAN_VIEW" },
  { to: "/gestao-arcovan/downloads", label: "Downloads", permission: "DOWNLOAD_MANAGE" }
];

const operationMenu = [
  { to: "/operacao-arcovan/checklists", label: "Execução de checklist", permission: "OPERATION_CHECKLIST" },
  { to: "/operacao-arcovan/dds", label: "Realizar DDS", permission: "OPERATION_DDS" },
  { to: "/operacao-arcovan/produtos-perdas-qualidade", label: "Produtos, perdas e qualidade", permission: "OPERATION_QUALITY" },
  { to: "/operacao-arcovan/inventario", label: "Inventário", permission: "OPERATION_INVENTORY" },
  { to: "/operacao-arcovan/ordens-manutencao", label: "Ordens de manutenção", permission: "OPERATION_MAINTENANCE" }
];

const cadastroMenu = [
  { to: "/empresa", label: "Empresa" },
  { to: "/funcionarios", label: "Funcionarios", permission: "EMPLOYEE_VIEW" },
  { to: "/epi", label: "EPI", permission: "EPI_VIEW" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/checklists", label: "Modelos de Checklist" },
  { to: "/usuarios", label: "Usuários e perfis" }
];

const recursosHumanosMenu = [
  { to: "/recursos-humanos", label: "Pulso do RH" },
  { to: "/recursos-humanos/epi", label: "EPI" },
  { to: "/recursos-humanos/funcionarios", label: "Funcionarios" },
  { to: "/recursos-humanos/indicadores-ocorrencias", label: "Ocorrencias" },
  { to: "/recursos-humanos/cadastros", label: "Cadastro" }
];

const segurancaPessoasMenu = [
  { to: "/seguranca-pessoas", label: "DDS", permission: "SAFETY_PEOPLE_VIEW" },
  { to: "/seguranca-pessoas/realizar", label: "Realizar DDS", permission: "SAFETY_PEOPLE_EXECUTE" },
  { to: "/seguranca-pessoas/historico", label: "Histórico", permission: "SAFETY_PEOPLE_VIEW" },
];

const commercialMenu = [
  { to: "/orcamentos", label: "Orçamentos", permission: "QUOTE_VIEW" },
  { to: "/forca-vendas/pedidos", label: "Pedidos fechados", permission: "SALES_VIEW" },
  { to: "/forca-vendas/crm", label: "CRM", permission: "CRM_VIEW" },
  { to: "/forca-vendas/relacao", label: "Relação de vendas", permission: "SALES_VIEW" }
];

const maintenanceMenu = [{ to: "/manutencao", label: "Gestão de manutenção", permission: "MAINTENANCE_VIEW" }];

const industrialMenus = [
  ...(procurementFeatures.purchasesEnabled ? [{ title: "Compras", items: [
    { to: "/compras", label: "Visão geral e solicitações", permission: "PURCHASE_VIEW" },
    { to: "/compras/cotacoes", label: "Cotações", permission: "PURCHASE_VIEW" },
    ...(procurementFeatures.purchaseApprovalsEnabled ? [{ to: "/compras/aprovacoes", label: "Aprovações", permission: "PURCHASE_APPROVE" }] : []),
    { to: "/compras/ordens", label: "Ordens de Compra", permission: "PURCHASE_VIEW" },
    ...(procurementFeatures.goodsReceiptsEnabled ? [{ to: "/compras/recebimentos", label: "Recebimentos", permission: "PURCHASE_VIEW" }] : [])
  ] }] : []),
  { title: "Força de Vendas", items: commercialMenu },
  { title: "Expedição", items: [{ to: "/expedicao/fretes", label: "Relação de fretes", permission: "EXPEDITION_VIEW" }] },
  { title: "Estoque", items: [
    { to: "/estoque", label: "Visão geral", permission: "INDUSTRIAL_STOCK_VIEW" },
    { to: "/estoque/produtos", label: "Produtos", permission: "INDUSTRIAL_STOCK_VIEW" },
    { to: "/estoque/lancamentos", label: "Produtos, perdas e qualidade", permission: "PRODUCTION_VIEW" },
    { to: "/estoque/lotes", label: "Lotes em cura", permission: "INDUSTRIAL_STOCK_VIEW" },
    { to: "/estoque/movimentacoes", label: "Movimentações", permission: "INDUSTRIAL_STOCK_VIEW" },
    { to: "/estoque/inventario", label: "Inventário", permission: "INDUSTRIAL_STOCK_VIEW" },
    { to: "/estoque/cadastros", label: "Cadastros auxiliares", permission: "INDUSTRIAL_STOCK_MANAGE" }
  ] },
  { title: "Financeiro", items: [
    ...(procurementFeatures.accountsPayableEnabled ? [{ to: "/financeiro/contas-a-pagar", label: "Contas a pagar", permission: "FINANCIAL_VALUE_VIEW" }] : []),
    ...(procurementFeatures.paymentsEnabled ? [{ to: "/financeiro/pagamentos", label: "Pagamentos", permission: "FINANCIAL_VALUE_VIEW" }] : []),
    ...(procurementFeatures.fiscalDocumentsEnabled ? [{ to: "/financeiro/entrada-notas", label: "Entrada de notas", permission: "FISCAL_DOCUMENT_IMPORT" }] : []),
    { to: "/financeiro/vendas", label: "Relação de vendas", permission: "FINANCE_VIEW" },
    { to: "/financeiro/fretes", label: "Relação de fretes", permission: "FINANCE_VIEW" },
    { to: "/financeiro/diesel", label: "Abastecimento de diesel", permission: "FINANCE_VIEW" }
  ] },
  { title: "Manutenção", items: maintenanceMenu }
];

function LegacyAppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => setMobileMenuOpen(false), [location.pathname]);
  const isChecklistOnly = Boolean(user?.checklistOnly);
  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: () => apiRequest<any>("/company"),
    enabled: !isChecklistOnly
  });
  const companyName = companyQuery.data?.tradeName || companyQuery.data?.legalName || "";
  const visibleDashboardMenu = dashboardMenu.filter((item) => userHasPermission(user, item.permission));
  const visibleOperationMenu = operationMenu.filter((item) => userHasPermission(user, item.permission));
  const visibleCadastroMenu =
    (userHasPermission(user, "GESTAO_ARCOVAN_VIEW") ? cadastroMenu : [])
      .filter((item) => !("permission" in item) || !item.permission || userHasPermission(user, item.permission));
  const visibleHrMenu = recursosHumanosMenu.filter((item) => {
    const permissionByRoute: Record<string, string> = {
      "/recursos-humanos": "HR_DASHBOARD_VIEW",
      "/recursos-humanos/epi": "EPI_VIEW",
      "/recursos-humanos/funcionarios": "EMPLOYEE_VIEW",
      "/recursos-humanos/indicadores-ocorrencias": "OCCURRENCE_VIEW",
      "/recursos-humanos/cadastros": "CATALOG_MANAGE"
    };
    if (item.to === "/recursos-humanos/cadastros") return userHasPermission(user, "CATALOG_MANAGE") || userHasPermission(user, "DEPARTMENT_VIEW");
    return userHasPermission(user, permissionByRoute[item.to]);
  });
  const visibleSafetyPeopleMenu = segurancaPessoasMenu.filter((item) => userHasPermission(user, item.permission));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f7fa_0%,#e8edf3_100%)] lg:grid lg:grid-cols-[320px,1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-slate-800">
        <div className="mb-8">
          <img src={getApiUrl("/brand/arcovan-logo.png")} alt="Arcovan Artefatos de Concreto" className="mb-4 max-h-20 max-w-[220px] rounded-xl bg-white p-2 object-contain" />
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">SmartCheck</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">Operacao Industrial</h1>
          {companyName ? <p className="mt-2 text-sm font-medium text-slate-300">{companyName}</p> : null}
        </div>

        <button type="button" className="mb-4 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-left font-semibold lg:hidden" aria-expanded={mobileMenuOpen} aria-controls="main-navigation" onClick={() => setMobileMenuOpen((open) => !open)}>
          {mobileMenuOpen ? "Fechar navegação" : "Abrir navegação"}
        </button>

        <div id="main-navigation" className={clsx(mobileMenuOpen ? "block" : "hidden", "lg:block")}>
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
          <p className="text-lg font-bold text-white">{user?.employee?.name ?? user?.email}</p>
          <p className="mt-1 text-slate-300">{user ? roleLabels[user.role] : ""}</p>
        </div>

        <div className="space-y-6">
          {visibleDashboardMenu.length > 0 && <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              GESTÃO ARCOVAN
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
          </section>}

          {visibleOperationMenu.length > 0 && <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">OPERAÇÃO ARCOVAN</p>
            <nav className="grid gap-2">
              {visibleOperationMenu.map((item) => <Link key={item.to} to={item.to} className={clsx("rounded-2xl border px-4 py-3 text-sm font-semibold transition", location.pathname === item.to ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-slate-800 bg-slate-900 text-slate-100 hover:border-cyan-700 hover:bg-slate-800")}>{item.label}</Link>)}
            </nav>
          </section>}

          {!isChecklistOnly && visibleHrMenu.length > 0 && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                Recursos Humanos
              </p>
              <nav className="grid gap-2">
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

          {!isChecklistOnly && visibleSafetyPeopleMenu.length > 0 && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Segurança e Pessoas</p>
              <nav className="grid gap-2">
                {visibleSafetyPeopleMenu.map((item) => <Link key={item.to} to={item.to} className={clsx("rounded-2xl border px-4 py-3 text-sm font-semibold transition", location.pathname === item.to ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-slate-800 bg-slate-900 text-slate-100 hover:border-cyan-700 hover:bg-slate-800")}>{item.label}</Link>)}
              </nav>
            </section>
          )}

          {!isChecklistOnly && industrialMenus.map((group) => {
            const visibleItems = group.items.filter((item) => userHasPermission(user, item.permission));
            if (visibleItems.length === 0) return null;
            return <section key={group.title}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{group.title}</p>
              <nav className="grid gap-2">{visibleItems.map((item) => <Link key={item.to} to={item.to} className={clsx("rounded-2xl border px-4 py-3 text-sm font-semibold transition", location.pathname === item.to ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-slate-800 bg-slate-900 text-slate-100 hover:border-cyan-700 hover:bg-slate-800")}>{item.label}</Link>)}</nav>
            </section>;
          })}

          {!isChecklistOnly && visibleCadastroMenu.length > 0 && (
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
        </div>
      </aside>

      <main className="min-w-0 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

type NavigationItem = { to: string; label: string; permission?: string; exact?: boolean };
type NavigationGroup = { id: BusinessArea; title: string; items: NavigationItem[] };

function executiveNavigation(): NavigationGroup[] {
  return [
    { id: "overview", title: "Gestão Arcovan", items: [{ to: "/gestao-arcovan", label: "Dashboard executivo", permission: "GESTAO_ARCOVAN_VIEW", exact: true }, { to: "/gestao-arcovan/historico-checklist", label: "Histórico de checklists", permission: "GESTAO_ARCOVAN_VIEW" }, { to: "/gestao-arcovan/downloads", label: "Downloads", permission: "DOWNLOAD_MANAGE" }] },
    { id: "operation", title: "Operação Arcovan", items: operationMenu },
    { id: "commercial", title: "Comercial", items: commercialMenu },
    ...(procurementFeatures.purchasesEnabled ? [{ id: "purchases" as const, title: "Compras e Suprimentos", items: [{ to: "/compras", label: "Visão geral e solicitações", permission: "PURCHASE_VIEW", exact: true }, { to: "/compras/cotacoes", label: "Cotações", permission: "PURCHASE_VIEW" }, ...(procurementFeatures.purchaseApprovalsEnabled ? [{ to: "/compras/aprovacoes", label: "Aprovações", permission: "PURCHASE_APPROVE" }] : []), { to: "/compras/ordens", label: "Ordens de Compra", permission: "PURCHASE_VIEW" }, ...(procurementFeatures.goodsReceiptsEnabled ? [{ to: "/compras/recebimentos", label: "Recebimentos", permission: "PURCHASE_VIEW" }] : [])] }] : []),
    { id: "finance", title: "Financeiro", items: [...(procurementFeatures.accountsPayableEnabled ? [{ to: "/financeiro/contas-a-pagar", label: "Contas a pagar", permission: "FINANCIAL_VALUE_VIEW" }] : []), ...(procurementFeatures.paymentsEnabled ? [{ to: "/financeiro/pagamentos", label: "Pagamentos", permission: "FINANCIAL_VALUE_VIEW" }] : []), ...(procurementFeatures.fiscalDocumentsEnabled ? [{ to: "/financeiro/entrada-notas", label: "Entrada de notas", permission: "FISCAL_DOCUMENT_IMPORT" }] : []), { to: "/financeiro/vendas", label: "Relação de vendas", permission: "FINANCE_VIEW" }, { to: "/financeiro/fretes", label: "Relação de fretes", permission: "FINANCE_VIEW" }, { to: "/financeiro/diesel", label: "Abastecimento de diesel", permission: "FINANCE_VIEW" }] },
    { id: "inventory", title: "Estoque e Expedição", items: [{ to: "/estoque", label: "Visão geral do estoque", permission: "INDUSTRIAL_STOCK_VIEW", exact: true }, { to: "/estoque/produtos", label: "Produtos", permission: "INDUSTRIAL_STOCK_VIEW" }, { to: "/estoque/lancamentos", label: "Perdas e qualidade", permission: "PRODUCTION_VIEW" }, { to: "/estoque/lotes", label: "Lotes em cura", permission: "INDUSTRIAL_STOCK_VIEW" }, { to: "/estoque/movimentacoes", label: "Movimentações", permission: "INDUSTRIAL_STOCK_VIEW" }, { to: "/estoque/inventario", label: "Inventário", permission: "INDUSTRIAL_STOCK_VIEW" }, { to: "/estoque/cadastros", label: "Cadastros do estoque", permission: "INDUSTRIAL_STOCK_MANAGE" }, { to: "/expedicao/fretes", label: "Expedição e fretes", permission: "EXPEDITION_VIEW" }] },
    { id: "maintenance", title: "Manutenção", items: maintenanceMenu },
    { id: "people", title: "Segurança e Pessoas", items: segurancaPessoasMenu },
    { id: "people", title: "Recursos Humanos", items: [{ to: "/recursos-humanos", label: "Pulso do RH", permission: "HR_DASHBOARD_VIEW", exact: true }, { to: "/recursos-humanos/epi", label: "EPI", permission: "EPI_VIEW" }, { to: "/recursos-humanos/funcionarios", label: "Funcionários", permission: "EMPLOYEE_VIEW" }, { to: "/recursos-humanos/indicadores-ocorrencias", label: "Ocorrências", permission: "OCCURRENCE_VIEW" }, { to: "/recursos-humanos/cadastros", label: "Cadastro", permission: "DEPARTMENT_VIEW" }] },
    { id: "admin", title: "Administração", items: cadastroMenu.map((item) => ({ ...item, permission: "permission" in item ? item.permission : "GESTAO_ARCOVAN_VIEW" })) }
  ];
}

function NavGlyph({ area }: { area: BusinessArea }) {
  const paths: Record<BusinessArea, React.ReactNode> = {
    overview: <><path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" /></>,
    operation: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m8.5 11 2.2 2.2 4.8-4.8" /></>,
    commercial: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" /></>,
    purchases: <><path d="M5 7h14l-1 8H7L5 4H2m6 15h.01M17 19h.01" /></>,
    finance: <><path d="M4 7h16v11H4z" /><path d="M4 10h16M8 15h3" /></>,
    inventory: <><path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10" /></>,
    maintenance: <><path d="m14.5 6.5 3-3 3 3-3 3m-2-1-9 9-3 3-2-2 3-3 9-9" /></>,
    people: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9 1v6m3-3h-6" /></>,
    admin: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">{paths[area]}</svg>;
}

function itemIsActive(pathname: string, item: NavigationItem) { return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`); }

function ExecutiveAppLayout() {
  const location = useLocation(); const navigationType = useNavigationType(); const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false); const [compact, setCompact] = useState(() => localStorage.getItem("smartcheck.sidebar.compact") === "true"); const [search, setSearch] = useState("");
  const contentRef = useRef<HTMLElement>(null); const menuButtonRef = useRef<HTMLButtonElement>(null); const closeButtonRef = useRef<HTMLButtonElement>(null); const positions = useRef(new Map<string, number>());
  const isChecklistOnly = Boolean(user?.checklistOnly);
  const companyQuery = useQuery({ queryKey: ["company"], queryFn: () => apiRequest<any>("/company"), enabled: !isChecklistOnly });
  const companyName = companyQuery.data?.tradeName || companyQuery.data?.legalName || "Arcovan";
  const groups = useMemo(() => executiveNavigation().map((group, index) => ({ ...group, key: `${group.id}-${index}`, items: group.items.filter((item) => item.permission && userHasPermission(user, item.permission)) })).filter((group) => group.items.length > 0), [user]);
  const activeGroup = groups.find((group) => group.items.some((item) => itemIsActive(location.pathname, item)));
  const activeItem = activeGroup?.items.find((item) => itemIsActive(location.pathname, item));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

  useEffect(() => { localStorage.setItem("smartcheck.sidebar.compact", String(compact)); }, [compact]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus({ preventScroll: true });
    };
  }, [mobileOpen]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = navigationType === "POP" ? positions.current.get(location.pathname) ?? 0 : 0;
      contentRef.current?.scrollTo({ top: target, behavior: "auto" });
      if (navigationType !== "POP") { const title = document.querySelector<HTMLElement>("#app-route-content h1"); if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); } }
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, navigationType]);

  function toggleGroup(key: string) { setOpenGroups((current) => current[key] ? {} : { [key]: true }); }
  function handleGroupToggle(key: string) {
    if (compact) {
      setCompact(false);
      setOpenGroups({ [key]: true });
      return;
    }
    toggleGroup(key);
  }
  function handleSearchChange(value: string) {
    setSearch(value);
    if (!value.trim()) setOpenGroups({});
  }
  const sidebar = <aside className={clsx("flex h-full min-h-0 flex-col bg-[#071b38] text-slate-100 shadow-2xl transition-[width] duration-200", compact ? "lg:w-20" : "lg:w-72")} aria-label="Navegação principal">
    <div className={clsx("smartcheck-mobile-safe-top smartcheck-sidebar-header relative flex min-h-20 shrink-0 items-center justify-center border-b border-white/10", compact ? "px-2" : "px-16 lg:px-4")}><BrandLogo compact={compact} /><button ref={closeButtonRef} type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-xl text-slate-200 hover:bg-white/10 lg:hidden" aria-label="Fechar menu">×</button></div>
    <div className={clsx("border-b border-white/10", compact ? "p-3" : "p-4")}>
      {compact ? <button type="button" title="Expandir menu" aria-label="Expandir menu" onClick={() => setCompact(false)} className="grid min-h-11 w-full place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"><NavGlyph area="overview" /></button> : <div className="relative"><svg className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input value={search} onChange={(event) => handleSearchChange(event.target.value)} className="min-h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30" placeholder="Buscar módulo…" aria-label="Buscar módulos e funcionalidades" /></div>}
    </div>
    <nav className="smartcheck-sidebar-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto px-3 py-4"><div className="space-y-2">{groups.map((group) => {
      const visibleItems = normalizedSearch ? group.items.filter((item) => `${group.title} ${item.label}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch)) : group.items; if (!visibleItems.length) return null; const expanded = normalizedSearch ? true : (openGroups[group.key] ?? false); const groupActive = group === activeGroup;
      return <section key={group.key}><button type="button" onClick={() => handleGroupToggle(group.key)} className={clsx("flex min-h-11 w-full items-center rounded-xl text-left text-xs font-bold uppercase tracking-[.08em] transition", compact ? "justify-center px-2" : "gap-3 px-3", groupActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")} title={compact ? group.title : undefined} aria-expanded={expanded}><NavGlyph area={group.id} />{compact ? null : <><span className="min-w-0 flex-1 truncate">{group.title}</span><span className={clsx("text-base transition", expanded && "rotate-90")} aria-hidden="true">›</span></>}</button>{!compact && expanded ? <div className="mb-2 ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">{visibleItems.map((item) => { const active = itemIsActive(location.pathname, item); return <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} className={clsx("flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold transition", active ? "bg-cyan-400 text-[#071b38] shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white")}><span className="truncate">{item.label}</span></Link>; })}</div> : null}</section>;
    })}</div></nav>
    <div className="smartcheck-mobile-safe-bottom shrink-0 border-t border-white/10 p-3"><div className={clsx("mb-2 rounded-xl bg-white/5", compact ? "p-2 text-center" : "p-3")} title={compact ? user?.employee?.name ?? user?.email : undefined}>{compact ? <span className="text-xs font-black">{(user?.employee?.name ?? user?.email ?? "U").slice(0, 2).toUpperCase()}</span> : <><p className="truncate text-sm font-bold">{user?.employee?.name ?? user?.email}</p><p className="truncate text-xs text-slate-400">{user ? roleLabels[user.role] : ""}</p></>}</div><div className={clsx("flex gap-2", compact && "flex-col")}><button type="button" onClick={() => setCompact((value) => !value)} className="hidden min-h-10 flex-1 rounded-xl border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 lg:block">{compact ? "›" : "Recolher"}</button><button type="button" onClick={logout} className="min-h-10 flex-1 rounded-xl border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10">{compact ? "Sair" : "Encerrar"}</button></div></div>
  </aside>;

  return <div className="flex h-screen h-[100dvh] min-h-0 overflow-hidden bg-[#f4f7fb] text-slate-900">
    <div className="hidden shrink-0 lg:block">{sidebar}</div>
    {mobileOpen ? <div id="executive-mobile-navigation" className="fixed inset-0 z-50 h-screen h-[100dvh] min-h-0 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação"><button className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" aria-label="Fechar menu clicando fora" onClick={() => setMobileOpen(false)} /><div className="relative h-full min-h-0 w-[min(88vw,320px)]">{sidebar}</div></div> : null}
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur md:px-6"><button ref={menuButtonRef} type="button" onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-[#0b2341] lg:hidden" aria-label="Abrir menu" aria-expanded={mobileOpen} aria-controls="executive-mobile-navigation"><span className="text-2xl">☰</span></button><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><AreaIdentity area={activeGroup?.id ?? "overview"} /><span aria-hidden="true">/</span><span className="truncate">{activeItem?.label ?? "SmartCheck"}</span></div><p className="truncate text-sm font-extrabold text-[#0b2341] md:text-base">{companyName}</p></div><div className="hidden text-right sm:block"><p className="max-w-52 truncate text-sm font-bold">{user?.employee?.name ?? user?.email}</p><p className="text-xs text-slate-500">{user ? roleLabels[user.role] : ""}</p></div></header>
      <main ref={contentRef} id="main-content-scroll" onScroll={(event) => positions.current.set(location.pathname, event.currentTarget.scrollTop)} className="smartcheck-main-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto scroll-smooth p-4 md:p-6 lg:p-8"><div id="app-route-content" className="mx-auto max-w-[1600px]"><Outlet /></div></main>
    </div>
  </div>;
}

export function AppLayout() { return visualFeatures.adminShellV2Enabled ? <ExecutiveAppLayout /> : <LegacyAppLayout />; }
