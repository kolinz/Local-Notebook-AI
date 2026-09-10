"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type CurrentUser, fetchCurrentUser, logout } from "@/lib/api-client";
import { publicEnv } from "@/config/public-env";

export function AuthStatus() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return <p className="auth-status">Checking session…</p>;
  }

  if (!user) {
    return (
      <p className="auth-status">
        Not signed in. <Link href={`/${publicEnv.defaultLocale}/login`}>Sign in</Link>
      </p>
    );
  }

  return (
    <p className="auth-status">
      Signed in as {user.displayName} ({user.role}).{" "}
      <button onClick={() => logout().then(() => setUser(null))}>Sign out</button>
      {" · "}
      <Link href={`/${publicEnv.defaultLocale}/notebooks`}>My Notebooks</Link>
      {user.role === "admin" && (
        <>
          {" · "}
          <Link href={`/${publicEnv.defaultLocale}/admin`}>Admin</Link>
        </>
      )}
    </p>
  );
}
