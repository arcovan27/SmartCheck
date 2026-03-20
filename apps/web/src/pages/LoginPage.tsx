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
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-brand-100 to-slate-100 p-4">
      <form className="card w-full max-w-sm space-y-4" onSubmit={onSubmit}>
        <div>
          <h1 className="text-2xl font-bold text-brand-800">SmartCheck</h1>
          <p className="text-sm text-slate-500">Gestão operacional industrial</p>
        </div>
        <label className="block text-sm font-medium">Email
          <input className="input mt-1" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">Senha
          <input className="input mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
