"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleLogout() {
    setMessage("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        setMessage("退出登录失败，请稍后重试。");
        return;
      }

      startTransition(() => {
        router.refresh();
        router.push("/");
      });
    } catch {
      setMessage("退出登录失败，请稍后重试。");
    }
  }

  return (
    <>
      <button className="nav-action" type="button" onClick={handleLogout} disabled={isPending}>
        {isPending ? "退出中..." : "登出"}
      </button>
      {message ? <span className="nav-message">{message}</span> : null}
    </>
  );
}
