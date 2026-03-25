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
    label: "Baixar pacote completo do agente (.zip)",
    href: buildDownloadUrl("agent-biometrico/SmartCheck-Agent-Biometrico.zip")
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
        description="Pacote unico com agente + scripts. Extraia o ZIP antes de executar o install-autostart.cmd."
        items={agentItems}
      />
    </div>
  );
}
