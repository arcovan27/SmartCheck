import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, userHasPermission } from "../lib/auth";

export function PermissionRoute({ permission, children }: { permission: string; children: ReactElement }) {
  const { user } = useAuth();
  if (!userHasPermission(user, permission)) return <Navigate to="/" replace />;
  return children;
}
