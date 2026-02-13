"use client";

import { useEffect } from "react";

export function ForceLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.classList.contains("dark") ? "dark" : "light";
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";

    return () => {
      root.classList.remove("light");
      if (prev === "dark") {
        root.classList.add("dark");
        root.style.colorScheme = "dark";
      }
    };
  }, []);

  return null;
}
