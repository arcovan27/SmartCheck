import { HrPageHeader } from "./HrPrototypeComponents";

export function HrWorkScheduleUnavailablePage() {
  return (
    <div className="space-y-6">
      <HrPageHeader
        eyebrow="Recursos Humanos"
        title="Modulo temporariamente indisponivel"
        description="A Escala de trabalho esta pausada. Os dados existentes foram preservados."
      />
      <section className="card p-6 text-sm text-slate-600" role="status">
        Continue utilizando as demais funcoes de Recursos Humanos normalmente.
      </section>
    </div>
  );
}
