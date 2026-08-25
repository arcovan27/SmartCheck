import clsx from "clsx";

export type BusinessArea = "overview" | "operation" | "commercial" | "purchases" | "finance" | "inventory" | "maintenance" | "people" | "admin";

const areaIdentity: Record<BusinessArea, { label: string; accent: string; soft: string }> = {
  overview: { label: "Gestão Arcovan", accent: "#38bdf8", soft: "#e0f2fe" },
  operation: { label: "Operação Arcovan", accent: "#22d3ee", soft: "#cffafe" },
  commercial: { label: "Comercial Arcovan", accent: "#a78bfa", soft: "#ede9fe" },
  purchases: { label: "Compras e Suprimentos", accent: "#f59e0b", soft: "#fef3c7" },
  finance: { label: "Financeiro", accent: "#10b981", soft: "#d1fae5" },
  inventory: { label: "Estoque e Expedição", accent: "#2dd4bf", soft: "#ccfbf1" },
  maintenance: { label: "Manutenção", accent: "#fb7185", soft: "#ffe4e6" },
  people: { label: "Segurança e Pessoas", accent: "#60a5fa", soft: "#dbeafe" },
  admin: { label: "Administração", accent: "#94a3b8", soft: "#e2e8f0" }
};

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) return <span className={clsx("grid h-10 w-10 place-items-center rounded-xl bg-white text-xs font-black tracking-tight text-[#0b2341] shadow-sm", className)} aria-label="SmartCheck">SC</span>;
  return <img src="/arcovan-logo.png" alt="Arcovan Soluções de Concreto" className={clsx("h-auto w-full object-contain", className)} />;
}

export function AreaIdentity({ area, compact = false }: { area: BusinessArea; compact?: boolean }) {
  const identity = areaIdentity[area];
  return <span className="inline-flex min-w-0 items-center gap-2" title={identity.label}><span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/20" style={{ backgroundColor: identity.accent }} aria-hidden="true" />{compact ? null : <span className="truncate">{identity.label}</span>}</span>;
}

export function areaColors(area: BusinessArea) { return areaIdentity[area]; }
