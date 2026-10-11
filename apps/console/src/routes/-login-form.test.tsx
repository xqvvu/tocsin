// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { authQueryKeys, dashboardSessionQueryOptions } from "#/features/auth/api/auth.queries";
import { AppIntlProvider } from "#/i18n/provider";
import { LoginForm } from "#/routes/-login-form";
import { LoginFormClient } from "#/routes/-login-form-impl";

const testState = vi.hoisted(() => ({
  navigate: vi.fn<() => Promise<void>>(async () => {}),
  toast: {
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
    success: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
  authClient: {
    signIn: {
      email:
        vi.fn<
          (input: {
            email: string;
            password: string;
          }) => Promise<{ error: null | { message?: string } }>
        >(),
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => testState.navigate,
}));

vi.mock("#/lib/auth.client", () => ({
  authClient: testState.authClient,
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

describe("login form", () => {
  afterEach(() => {
    cleanup();
    testState.navigate.mockClear();
    testState.toast.error.mockClear();
    testState.toast.success.mockClear();
    testState.authClient.signIn.email.mockReset();
  });

  it("renders a sign-in only form", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <LoginFormClient redirectTo="/" />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Login" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create owner" })).toBeNull();
    expect(screen.queryByText("First setup")).toBeNull();
    expect(screen.queryByText("Login with Google")).toBeNull();
    expect(screen.queryByText("Sign up")).toBeNull();
  });

  it("renders zh-Hans messages when the provider locale is zh-Hans", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="zh-Hans">
          <LoginFormClient redirectTo="/" />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    expect(screen.getByText("登录 Tocsin")).toBeTruthy();
  });

  it("exposes a colocated skeleton", () => {
    const { container } = render(<LoginForm.Skeleton />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("submits credentials through Better Auth sign-in and returns to the dashboard", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    testState.authClient.signIn.email.mockResolvedValueOnce({ error: null });
    queryClient.setQueryData(dashboardSessionQueryOptions().queryKey, null);

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <LoginFormClient redirectTo="/" />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Login" }).closest("form")!);

    await vi.waitFor(() => {
      expect(testState.authClient.signIn.email).toHaveBeenCalledWith({
        email: "owner@example.test",
        password: "correct horse battery staple",
      });
      expect(queryClient.getQueryData(dashboardSessionQueryOptions().queryKey)).toBeUndefined();
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: authQueryKeys.all,
      });
      expect(testState.toast.success).toHaveBeenCalledWith("Logged in", {
        description: "Opening the dashboard",
      });
      expect(testState.navigate).toHaveBeenCalledWith({
        to: "/",
        replace: true,
      });
    });
  });

  it("shows a toast when sign-in fails", async () => {
    const queryClient = new QueryClient();
    testState.authClient.signIn.email.mockResolvedValueOnce({
      error: {
        message: "Invalid password",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <LoginFormClient redirectTo="/" />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong password" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Login" }).closest("form")!);

    await vi.waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith("Login failed", {
        description: "Invalid password",
      });
      expect(testState.navigate).not.toHaveBeenCalled();
    });
  });
});
