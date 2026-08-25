import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export function HrPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 rounded-[28px] border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-[0_22px_60px_rgba(15,23,42,0.18)] sm:px-7 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-300">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="text-lg font-extrabold tracking-tight text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  const toneClass = {
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    info: "bg-cyan-100 text-cyan-800",
    neutral: "bg-slate-200 text-slate-700"
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
}

export function MetricCard({ label, value, detail, tone = "brand", to }: { label: string; value: string; detail: string; tone?: "brand" | "success" | "warning" | "danger" | "info"; to?: string }) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-800 ring-brand-100",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    warning: "bg-amber-50 text-amber-800 ring-amber-100",
    danger: "bg-red-50 text-red-800 ring-red-100",
    info: "bg-cyan-50 text-cyan-800 ring-cyan-100"
  }[tone];
  const content = (
    <div className="card h-full bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`mb-5 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-extrabold ring-1 ${toneClass}`} aria-hidden="true">
        {label.slice(0, 2).toUpperCase()}
      </div>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export function HrSectionTabs() {
  const location = useLocation();
  const tabs = [
    { to: "/recursos-humanos", label: "Pulso do RH" },
    { to: "/recursos-humanos/epi", label: "EPI" },
    { to: "/recursos-humanos/funcionarios", label: "Funcionários" },
    { to: "/recursos-humanos/indicadores-ocorrencias", label: "Ocorrências" },
    { to: "/recursos-humanos/cadastros", label: "Cadastro" }
  ];
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seções de Recursos Humanos">
      {tabs.map((tab) => {
        const active = location.pathname === tab.to || (tab.to === "/recursos-humanos/cadastros" && location.pathname.startsWith("/recursos-humanos/cadastros/"));
        return (
          <Link key={tab.to} to={tab.to} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${active ? "bg-brand-700 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800"}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MiniAvatar({ initials }: { initials: string }) {
  return <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white">{initials}</span>;
}
