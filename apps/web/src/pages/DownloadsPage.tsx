import { API_URL } from "../lib/api";

function buildDownloadUrl(path: string) {
  return `${API_URL}/downloads/${path}`;
}

const driverItems = [
  {
    label: "Driver U.are.U x64 (.msi)",
    href: buildDownloadUrl("drivers-sdk/setup-x64.msi")
  },
  {
    label: "Driver U.are.U x86 (.msi)",
    href: buildDownloadUrl("drivers-sdk/setup-x86.msi")
  },
  {
    label: "SDK x64 (setup.exe)",
    href: buildDownloadUrl("drivers-sdk/SDK/x64/setup.exe")
  },
  {
    label: "SDK x86 (setup.exe)",
    href: buildDownloadUrl("drivers-sdk/SDK/x86/setup.exe")
  }
];

const agentItems = [
  {
    label: "Agente biometrico (JAR)",
    href: buildDownloadUrl("agent-biometrico/SmartCheckBiometricAgent.jar")
  },
  {
    label: "Executar agente (CMD)",
    href: buildDownloadUrl("agent-biometrico/run-agent.cmd")
  },
  {
    label: "Executar agente (PowerShell)",
    href: buildDownloadUrl("agent-biometrico/run-agent.ps1")
  },
  {
    label: "Instalar auto start",
    href: buildDownloadUrl("agent-biometrico/install-autostart.cmd")
  },
  {
    label: "Remover auto start",
    href: buildDownloadUrl("agent-biometrico/remove-autostart.cmd")
  },
  {
    label: "Guia rapido (README)",
    href: buildDownloadUrl("agent-biometrico/README.md")
  }
];

function DownloadList({ title, description, items }: { title: string; description: string; items: { label: string; href: string }[] }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <a
            key={item.href}
            className="btn-secondary text-center"
            href={item.href}
            target="_blank"
            rel="noreferrer"
            download
          >
            {item.label}
          </a>
        ))}
      </div>
    </section>
  );
}

export function DownloadsPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DownloadList
        title="Downloads de Driver e SDK"
        description="Arquivos oficiais para instalar o leitor biometrico no Windows."
        items={driverItems}
      />
      <DownloadList
        title="Downloads do Agente"
        description="Agente local e scripts para iniciar automaticamente no computador."
        items={agentItems}
      />
    </div>
  );
}
