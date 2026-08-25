export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export function getApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("smartcheck.token");
  const hasJsonBody = options?.body !== undefined && !(options.body instanceof FormData);

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), {
      ...options,
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {})
      }
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Tente novamente.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: undefined }));
    const fallbackMessage =
      response.status === 401
        ? "E-mail ou senha inválidos."
        : response.status === 403
          ? "Usuário sem permissão de acesso."
          : "Não foi possível concluir a operação. Tente novamente.";
    throw new Error(data.message ?? fallbackMessage);
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

export function getUploadedFileUrl(storedPath?: string | null): string | null {
  if (!storedPath) return null;
  const normalizedPath = storedPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const pathWithoutRoot = normalizedPath.replace(/^[^/]+\//, "");
  return getApiUrl(`/files/${pathWithoutRoot}`);
}

export async function downloadProtectedDocument(id: string, filename: string): Promise<void> {
  const token = localStorage.getItem("smartcheck.token");
  const response = await fetch(getApiUrl(`/hr/documents/${id}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Falha ao baixar documento" }));
    throw new Error(data.message ?? "Falha ao baixar documento");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadProtectedFile(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem("smartcheck.token");
  const response = await fetch(getApiUrl(`/downloads/${path}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Falha ao baixar arquivo" }));
    throw new Error(data.message ?? "Falha ao baixar arquivo");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
