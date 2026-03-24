import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function CompanyPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    legalName: "",
    tradeName: "",
    cnpj: "",
    email: "",
    phone: "",
    addressLine: "",
    city: "",
    state: "",
    zipCode: ""
  });

  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: () => apiRequest<any>("/company")
  });

  useEffect(() => {
    const data = companyQuery.data;
    if (!data) return;
    setForm({
      legalName: data.legalName ?? "",
      tradeName: data.tradeName ?? "",
      cnpj: data.cnpj ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      addressLine: data.addressLine ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      zipCode: data.zipCode ?? ""
    });
  }, [companyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("/company", {
        method: "PUT",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      setMessage("Dados da empresa salvos com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["company"] });
    }
  });

  const lookupCnpj = useMutation({
    mutationFn: (cnpj: string) => apiRequest<any>(`/company/cnpj/${onlyDigits(cnpj)}`),
    onSuccess: (data) => {
      setForm((prev) => ({
        ...prev,
        legalName: data.legalName || prev.legalName,
        tradeName: data.tradeName || prev.tradeName,
        cnpj: data.cnpj || prev.cnpj,
        email: data.email || prev.email,
        phone: data.phone || prev.phone,
        addressLine: data.addressLine || prev.addressLine,
        city: data.city || prev.city,
        state: data.state || prev.state,
        zipCode: data.zipCode || prev.zipCode
      }));
      setMessage("CNPJ consultado com sucesso.");
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    saveMutation.mutate({
      ...form,
      cnpj: onlyDigits(form.cnpj),
      tradeName: form.tradeName || null,
      email: form.email || null,
      phone: form.phone || null,
      addressLine: form.addressLine || null,
      city: form.city || null,
      state: form.state || null,
      zipCode: form.zipCode || null
    });
  }

  return (
    <section className="card space-y-3">
      <h2 className="section-title">Cadastro de Empresa</h2>
      <p className="text-sm text-slate-500">
        Esses dados sao usados nos documentos impressos do sistema.
      </p>
      <form className="space-y-2" onSubmit={submit}>
        <div className="grid gap-2 sm:grid-cols-[1fr,180px]">
          <input
            className="input"
            placeholder="CNPJ"
            value={formatCnpj(form.cnpj)}
            onChange={(event) => setForm((prev) => ({ ...prev, cnpj: event.target.value }))}
            onBlur={() => {
              if (onlyDigits(form.cnpj).length === 14 && !lookupCnpj.isPending) {
                lookupCnpj.mutate(form.cnpj);
              }
            }}
            required
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => lookupCnpj.mutate(form.cnpj)}
            disabled={lookupCnpj.isPending || onlyDigits(form.cnpj).length !== 14}
          >
            {lookupCnpj.isPending ? "Consultando..." : "Buscar CNPJ"}
          </button>
        </div>
        <input
          className="input"
          placeholder="Razao social"
          value={form.legalName}
          onChange={(event) => setForm((prev) => ({ ...prev, legalName: event.target.value }))}
          required
        />
        <input
          className="input"
          placeholder="Nome fantasia (opcional)"
          value={form.tradeName}
          onChange={(event) => setForm((prev) => ({ ...prev, tradeName: event.target.value }))}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            placeholder="E-mail"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            className="input"
            placeholder="Telefone"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
        </div>
        <input
          className="input"
          placeholder="Endereco"
          value={form.addressLine}
          onChange={(event) => setForm((prev) => ({ ...prev, addressLine: event.target.value }))}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="input"
            placeholder="Cidade"
            value={form.city}
            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
          />
          <input
            className="input"
            placeholder="UF"
            value={form.state}
            onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
          />
          <input
            className="input"
            placeholder="CEP"
            value={form.zipCode}
            onChange={(event) => setForm((prev) => ({ ...prev, zipCode: event.target.value }))}
          />
        </div>
        <button className="btn-primary w-full" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Salvando..." : "Salvar empresa"}
        </button>
      </form>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {(saveMutation.isError || lookupCnpj.isError) && (
        <p className="text-sm text-red-700">
          {(saveMutation.error as Error)?.message || (lookupCnpj.error as Error)?.message}
        </p>
      )}
    </section>
  );
}
