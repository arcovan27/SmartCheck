import { useQuery } from "@tanstack/react-query";
import { epiFeaturesQuery } from "../../config/epiFeatures";
import { EntregaEpiPage } from "../EntregaEpiPage";
import { HrSectionTabs } from "./HrPrototypeComponents";

export function HrEpiDeliveryRoute() {
  const featuresQuery = useQuery(epiFeaturesQuery);

  if (featuresQuery.data?.deliveryFormEnabled) return <EntregaEpiPage />;

  return (
    <div className="space-y-5">
      <HrSectionTabs />
      <section className="card border-amber-200 bg-amber-50 p-6 text-amber-950" role="status">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-700">Temporariamente indisponível</p>
        <h2 className="mt-2 text-xl font-extrabold">Entrega de EPI</h2>
        <p className="mt-2 text-sm">A entrega de EPI está temporariamente indisponível.</p>
      </section>
    </div>
  );
}
