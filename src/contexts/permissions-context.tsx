"use client";

import React, { createContext, useContext, useMemo } from "react";

interface PermissionsContextType {
  permissions: string[];
  hasPermission: (code: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  hasPermission: () => false,
});

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: string[];
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      permissions,
      hasPermission: (code: string) => permissions.includes(code),
    }),
    [permissions]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextType {
  return useContext(PermissionsContext);
}
