import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { roleLabels } from "../lib/constants";

const roles = [
  "ADMIN",
  "MANUTENCAO",
  "OPERADOR",
  "SEGURANCA_DO_TRABALHO",
  "ALMOXARIFADO"
] as const;

export function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "", role: "OPERADOR", employeeId: "", isActive: true });
  const [reset, setReset] = useState({ userId: "", password: "" });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiRequest<any[]>("/users")
  });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiRequest<any[]>("/employees")
  });

  const createUser = useMutation({
    mutationFn: (payload: any) => apiRequest("/users", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setForm({ email: "", password: "", role: "OPERADOR", employeeId: "", isActive: true });
    }
  });

  const updateUser = useMutation({
    mutationFn: (payload: any) =>
      apiRequest(`/users/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });

  const resetPassword = useMutation({
    mutationFn: (payload: { userId: string; password: string }) =>
      apiRequest(`/users/${payload.userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: payload.password })
      }),
    onSuccess: () => setReset({ userId: "", password: "" })
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    createUser.mutate({
      ...form,
      employeeId: form.employeeId || null
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr,1.3fr]">
        <form className="card space-y-3" onSubmit={submitCreate}>
          <h2 className="section-title">Cadastrar usuário</h2>
          <input
            className="input"
            placeholder="E-mail"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Senha inicial"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
          <select
            className="select"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={form.employeeId}
            onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
          >
            <option value="">Sem vínculo de funcionário</option>
            {employeesQuery.data?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.registration})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            Usuário ativo
          </label>

          <button className="btn-primary w-full" disabled={createUser.isPending}>
            {createUser.isPending ? "Salvando..." : "Criar usuário"}
          </button>
          {createUser.isError && <p className="text-sm text-red-700">{(createUser.error as Error).message}</p>}
        </form>

        <section className="card space-y-3">
          <h2 className="section-title">Redefinir senha</h2>
          <select
            className="select"
            value={reset.userId}
            onChange={(event) => setReset({ ...reset, userId: event.target.value })}
          >
            <option value="">Selecione o usuário</option>
            {usersQuery.data?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Nova senha"
            type="password"
            value={reset.password}
            onChange={(event) => setReset({ ...reset, password: event.target.value })}
          />
          <button
            className="btn-secondary w-full"
            disabled={!reset.userId || !reset.password || resetPassword.isPending}
            onClick={() => resetPassword.mutate({ userId: reset.userId, password: reset.password })}
          >
            {resetPassword.isPending ? "Redefinindo..." : "Redefinir senha"}
          </button>
          {resetPassword.isSuccess && <p className="text-sm text-emerald-700">Senha redefinida com sucesso.</p>}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title mb-3">Usuários cadastrados</h2>
        {usersQuery.isLoading && <p>Carregando usuários...</p>}
        {usersQuery.isError && (
          <p className="text-red-700">Você não tem permissão para acessar o módulo de usuários.</p>
        )}
        <div className="space-y-2">
          {usersQuery.data?.map((user) => (
            <div key={user.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{user.email}</p>
                  <p className="text-slate-500">Perfil: {roleLabels[user.role as keyof typeof roleLabels] ?? user.role}</p>
                  <p className="text-slate-500">
                    Funcionário: {user.employee ? `${user.employee.name} (${user.employee.registration})` : "Sem vínculo"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={user.isActive ? "badge-success" : "badge-neutral"}>
                    {user.isActive ? "Ativo" : "Inativo"}
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => updateUser.mutate({ id: user.id, data: { isActive: !user.isActive } })}
                  >
                    {user.isActive ? "Inativar" : "Ativar"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
