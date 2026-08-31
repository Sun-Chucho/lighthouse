"use client";

import { useEffect, useState } from "react";
import { readStoredRole } from "@/app/lib/auth";

export function useIsDirector() {
  const [isDirector, setIsDirector] = useState(false);

  useEffect(() => {
    const role = readStoredRole();
    setIsDirector(role === "director");
  }, []);

  return isDirector;
}
