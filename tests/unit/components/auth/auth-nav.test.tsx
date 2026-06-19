import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthNav } from "@/components/auth/auth-nav";

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">登出</button>,
}));

describe("AuthNav", () => {
  it("shows login and register actions for guests", () => {
    render(<AuthNav user={null} />);

    expect(screen.getByRole("link", { name: "登录" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "注册" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "登出" })).toBeNull();
  });

  it("shows account email and logout action for signed-in users", () => {
    render(<AuthNav user={{ email: "milu@example.com" }} />);

    expect(screen.getByRole("link", { name: /当前账户 milu@example.com/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "登出" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "登录" })).toBeNull();
    expect(screen.queryByRole("link", { name: "注册" })).toBeNull();
  });
});
