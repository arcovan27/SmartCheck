import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@smartcheck.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[linear-gradient(135deg,#082f49_0%,#0f172a_45%,#020617_100%)] p-4">
      <form
        className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-950/85 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur"
        onSubmit={onSubmit}
      >
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">SmartCheck</p>
          <h1 className="mt-2 text-3xl font-extrabold text-white">Operação Industrial</h1>
          <p className="mt-2 text-sm text-slate-300">Acesso inicial do sistema com usuário administrador.</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-200">
            E-mail
            <input className="input mt-1" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Senha
            <input className="input mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-100 p-2 text-sm text-red-700">{error}</p>}

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
          <p className="font-semibold text-white">Usuário inicial</p>
          <p>Login: admin@smartcheck.local</p>
          <p>Senha: admin123</p>
        </div>

        <button className="btn-primary mt-4 w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
