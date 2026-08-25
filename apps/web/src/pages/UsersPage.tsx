import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "../components/SearchableSelect";
import { apiRequest } from "../lib/api";
import { roleLabels } from "../lib/constants";

const roles = [
  "ADMIN",
  "ENCARREGADO",
  "MANUTENCAO",
  "OPERADOR",
  "RECURSOS_HUMANOS",
  "SEGURANCA_DO_TRABALHO",
  "VENDEDOR",
  "EXPEDICAO",
  "ALMOXARIFADO",
] as const;

type UserRole = (typeof roles)[number];
type Employee = {
  id: string;
  name: string;
  registration: string;
  isActive: boolean;
  user?: { id: string; email: string } | null;
  roles?: { role: UserRole }[];
};
type User = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  employeeId: string | null;
  employee: Employee | null;
};
type EditForm = {
  user: User;
  role: UserRole;
  additionalRoles: UserRole[];
  employeeId: string;
  isActive: boolean;
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "", role: "OPERADOR" as UserRole, employeeId: "", isActive: true });
  const [profiles, setProfiles] = useState<UserRole[]>(["OPERADOR"]);
  const [reset, setReset] = useState({ userId: "", password: "" });
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiRequest<User[]>("/users"),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "active", "user-administration"],
    queryFn: () => apiRequest<Employee[]>("/employees?isActive=true"),
  });

  const createUser = useMutation({
    mutationFn: (payload: unknown) => apiRequest<User>("/users", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      setForm({ email: "", password: "", role: "OPERADOR", employeeId: "", isActive: true });
      setProfiles(["OPERADOR"]);
    },
  });

  const updateUser = useMutation({
    mutationFn: (payload: { id: string; data: { role?: UserRole; roles?: UserRole[]; employeeId?: string | null; isActive?: boolean } }) =>
      apiRequest<User>(`/users/${payload.id}`, { method: "PATCH", body: JSON.stringify(payload.data) }),
    onSuccess: (updated) => {
      queryClient.setQueryData<User[]>(["users"], (current) =>
        current?.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)),
      );
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const editUser = useMutation({
    mutationFn: (payload: { id: string; data: { role: UserRole; roles: UserRole[]; employeeId: string | null; isActive: boolean } }) =>
      apiRequest<User>(`/users/${payload.id}`, { method: "PATCH", body: JSON.stringify(payload.data) }),
    onSuccess: (updated) => {
      queryClient.setQueryData<User[]>(["users"], (current) =>
        current?.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)),
      );
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditing(null);
      setSuccessMessage(`Usuário ${updated.email} atualizado com sucesso.`);
    },
  });

  const resetPassword = useMutation({
    mutationFn: (payload: { userId: string; password: string }) =>
      apiRequest(`/users/${payload.userId}/reset-password`, { method: "POST", body: JSON.stringify({ password: payload.password }) }),
    onSuccess: () => setReset({ userId: "", password: "" }),
  });

  const availableEmployees = useMemo(
    () => employeesQuery.data?.filter((employee) => !employee.user || employee.id === editing?.employeeId) ?? [],
    [employeesQuery.data, editing?.employeeId],
  );
  const createEmployeeOptions = useMemo(
    () => (employeesQuery.data ?? []).filter((employee) => !employee.user).map(employeeOption),
    [employeesQuery.data],
  );

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    createUser.mutate({
      ...form,
      roles: [...new Set([form.role, ...profiles])],
      employeeId: form.employeeId || null,
    });
  }

  function openEdit(user: User) {
    setSuccessMessage("");
    editUser.reset();
    setEditing({
      user,
      role: user.role,
      additionalRoles: (user.employee?.roles?.map((item) => item.role) ?? []).filter((role) => role !== user.role),
      employeeId: user.employeeId ?? "",
      isActive: user.isActive,
    });
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    editUser.mutate({
      id: editing.user.id,
      data: {
        role: editing.role,
        roles: [...new Set([editing.role, ...editing.additionalRoles])],
        employeeId: editing.employeeId || null,
        isActive: editing.isActive,
      },
    });
  }

  return (
    <div className="space-y-4">
      {successMessage ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{successMessage}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr,1.3fr]">
        <form className="card space-y-3" onSubmit={submitCreate}>
          <h2 className="section-title">Cadastrar usuário</h2>
          <input className="input" placeholder="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          <input className="input" placeholder="Senha inicial" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <select className="select" value={form.role} onChange={(event) => { const role = event.target.value as UserRole; setForm({ ...form, role }); setProfiles((current) => current.filter((item) => item !== role)); }}>
            {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-2 text-sm font-semibold">Perfis adicionais do funcionário</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((role) => <RoleCheckbox key={role} role={role} checked={role === form.role || profiles.includes(role)} disabled={role === form.role} onChange={() => setProfiles(toggleRole(profiles, role))} />)}
            </div>
          </fieldset>
          <SearchableSelect id="new-user-employee" label="Funcionário vinculado" value={form.employeeId} options={createEmployeeOptions} onChange={(employeeId) => setForm({ ...form, employeeId })} placeholder="Pesquisar por nome ou matrícula" emptyValueLabel="Sem vínculo de funcionário" clearLabel="Sem vínculo de funcionário" loading={employeesQuery.isLoading} errorMessage={employeesQuery.isError ? "Não foi possível carregar os funcionários ativos." : undefined} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Usuário ativo</label>
          <button className="btn-primary w-full" disabled={createUser.isPending}>{createUser.isPending ? "Salvando..." : "Criar usuário"}</button>
          {createUser.isError ? <p className="text-sm text-red-700">{(createUser.error as Error).message}</p> : null}
        </form>

        <section className="card space-y-3">
          <h2 className="section-title">Redefinir senha</h2>
          <select className="select" value={reset.userId} onChange={(event) => setReset({ ...reset, userId: event.target.value })}>
            <option value="">Selecione o usuário</option>
            {usersQuery.data?.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
          <input className="input" placeholder="Nova senha" type="password" value={reset.password} onChange={(event) => setReset({ ...reset, password: event.target.value })} />
          <button className="btn-secondary w-full" disabled={!reset.userId || !reset.password || resetPassword.isPending} onClick={() => resetPassword.mutate({ userId: reset.userId, password: reset.password })}>{resetPassword.isPending ? "Redefinindo..." : "Redefinir senha"}</button>
          {resetPassword.isSuccess ? <p className="text-sm text-emerald-700">Senha redefinida com sucesso.</p> : null}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title mb-3">Usuários cadastrados</h2>
        {usersQuery.isLoading ? <p>Carregando usuários...</p> : null}
        {usersQuery.isError ? <p className="text-red-700">Você não tem permissão para acessar o módulo de usuários.</p> : null}
        {updateUser.isError ? <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{(updateUser.error as Error).message}</p> : null}
        <div className="space-y-2">
          {usersQuery.data?.map((user) => (
            <div key={user.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="break-all font-semibold">{user.email}</p>
                  <p className="text-slate-500">Perfil primário: {roleLabels[user.role] ?? user.role}</p>
                  <p className="text-slate-500">Perfis: {user.employee?.roles?.map((item) => roleLabels[item.role] ?? item.role).join(", ") || "Nenhum perfil operacional"}</p>
                  <p className="text-slate-500">Funcionário: {user.employee ? `${user.employee.name} (${user.employee.registration})` : "Sem vínculo"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={user.isActive ? "badge-success" : "badge-neutral"}>{user.isActive ? "Ativo" : "Inativo"}</span>
                  <button type="button" className="btn-secondary" onClick={() => openEdit(user)}>Editar</button>
                  <button type="button" className="btn-secondary" disabled={updateUser.isPending} onClick={() => updateUser.mutate({ id: user.id, data: { isActive: !user.isActive } })}>{user.isActive ? "Inativar" : "Ativar"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-user-title" onPointerDown={(event) => { if (event.target === event.currentTarget && !editUser.isPending) setEditing(null); }}>
          <form className="max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl sm:p-6" onSubmit={submitEdit}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Administração de acesso</p><h2 id="edit-user-title" className="mt-1 text-xl font-extrabold">Editar usuário</h2><p className="mt-1 break-all text-sm text-slate-600">Login: {editing.user.email}</p></div>
              <button type="button" className="btn-secondary" disabled={editUser.isPending} onClick={() => setEditing(null)}>Fechar</button>
            </div>
            <p className="mt-4 rounded-xl bg-cyan-50 p-3 text-sm text-cyan-900">O e-mail de login não será alterado nesta operação.</p>
            <div className="mt-4 grid gap-4">
              <label className="text-sm font-semibold">Perfil primário<select className="select mt-1" value={editing.role} onChange={(event) => { const role = event.target.value as UserRole; setEditing({ ...editing, role, additionalRoles: editing.additionalRoles.filter((item) => item !== role) }); }}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
              <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-2 text-sm font-semibold">Perfis adicionais</legend><div className="grid gap-2 sm:grid-cols-2">{roles.map((role) => <RoleCheckbox key={role} role={role} checked={role === editing.role || editing.additionalRoles.includes(role)} disabled={role === editing.role} onChange={() => setEditing({ ...editing, additionalRoles: toggleRole(editing.additionalRoles, role) })} />)}</div></fieldset>
              <SearchableSelect id={`edit-user-employee-${editing.user.id}`} label="Funcionário vinculado" value={editing.employeeId} options={availableEmployees.map(employeeOption)} onChange={(employeeId) => setEditing({ ...editing, employeeId })} placeholder="Pesquisar por nome ou matrícula" emptyValueLabel="Sem vínculo de funcionário" clearLabel="Remover vínculo" loading={employeesQuery.isLoading} errorMessage={employeesQuery.isError ? "Não foi possível carregar os funcionários ativos." : undefined} />
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} />Usuário ativo</label>
            </div>
            {editUser.isError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{(editUser.error as Error).message}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" disabled={editUser.isPending} onClick={() => setEditing(null)}>Cancelar</button><button className="btn-primary" disabled={editUser.isPending}>{editUser.isPending ? "Salvando..." : "Salvar alterações"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function employeeOption(employee: Employee) {
  return { value: employee.id, label: `${employee.name} (${employee.registration})` };
}

function toggleRole(current: UserRole[], role: UserRole) {
  return current.includes(role) ? current.filter((item) => item !== role) : [...current, role];
}

function RoleCheckbox({ role, checked, disabled, onChange }: { role: UserRole; checked: boolean; disabled: boolean; onChange: () => void }) {
  return <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />{roleLabels[role]}</label>;
}
