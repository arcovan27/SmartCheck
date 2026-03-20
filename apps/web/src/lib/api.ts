const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export function getApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("smartcheck.token");

  const response = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {})
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Erro inesperado" }));
    throw new Error(data.message ?? "Erro inesperado");
  }

  return response.json();
}

export async function uploadFile(file: File): Promise<{ id: string; path: string }> {
  const token = localStorage.getItem("smartcheck.token");
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(getApiUrl("/uploads"), {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Falha no upload" }));
    throw new Error(data.message ?? "Falha no upload");
  }

  return response.json();
}
