import { useState } from "react";
import { downloadProtectedFile } from "../lib/api";

const driverItems = [
  {
    label: "Driver U.are.U x64 (.msi)",
    path: "drivers-sdk/setup-x64.msi"
  },
  {
    label: "Driver U.are.U x86 (.msi)",
    path: "drivers-sdk/setup-x86.msi"
  },
  {
    label: "SDK x64 (setup.exe)",
    path: "drivers-sdk/SDK/x64/setup.exe"
  },
  {
    label: "SDK x86 (setup.exe)",
    path: "drivers-sdk/SDK/x86/setup.exe"
  }
];

const agentItems = [
  {
    label: "Baixar pacote completo do agente (.zip)",
    path: "agent-biometrico/SmartCheck-Agent-Biometrico.zip"
  }
];

function DownloadList({ title, description, items }: { title: string; description: string; items: { label: string; path: string }[] }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  async function download(path: string) {
    setError(""); setPending(path);
    try { const parts = path.split("/"); await downloadProtectedFile(path, parts[parts.length - 1] ?? "download"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao baixar arquivo"); }
    finally { setPending(""); }
  }
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <button
            type="button"
            key={item.path}
            className="btn-secondary text-center"
            disabled={pending === item.path}
            onClick={() => void download(item.path)}
          >
            {pending === item.path ? "Preparando download..." : item.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
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
