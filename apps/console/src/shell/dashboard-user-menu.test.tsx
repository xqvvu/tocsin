// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "#/components/ui/sidebar";
import { authQueryKeys, dashboardSessionQueryOptions } from "#/features/auth/api/auth.queries";
import { AppIntlProvider } from "#/i18n/provider";
import { DashboardUserMenu } from "#/shell/dashboard-user-menu";
import { DashboardUserMenuClient } from "#/shell/dashboard-user-menu-impl";

const testState = vi.hoisted(() => ({
  navigate: vi.fn<() => Promise<void>>(async () => {}),
  toast: {
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
    success: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
  authClient: {
    signOut: vi.fn<(input?: { fetchOptions?: { onSuccess?: () => void | Promise<void> } }) => void>(
      (input) => {
        void input?.fetchOptions?.onSuccess?.();
      },
    ),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => testState.navigate,
}));

vi.mock("#/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("#/lib/auth.client", () => ({
  authClient: testState.authClient,
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

vi.mock("#/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

vi.mock("#/components/ui/button", () => ({
  Button: ({
    children,
    render,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    render?: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
  }) =>
    render ? (
      <button {...render.props} {...props}>
        {children}
      </button>
    ) : (
      <button {...props}>{children}</button>
    ),
}));

vi.mock("#/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({
    children,
    render,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement<Record<string, unknown>>;
  }) => (render ? React.cloneElement(render, undefined, children) : <div>{children}</div>),
}));

describe("dashboard user menu", () => {
  afterEach(() => {
    cleanup();
    testState.navigate.mockClear();
    testState.toast.error.mockClear();
    testState.toast.success.mockClear();
    testState.authClient.signOut.mockClear();
  });

  it("clears cached auth state and navigates to login after sign out", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const session = {
      user: {
        id: "user-1",
        name: "Tocsin Owner",
        email: "owner@example.test",
        image: null,
        role: "owner",
      },
    };

    queryClient.setQueryData(dashboardSessionQueryOptions().queryKey, session);

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <DashboardUserMenuClient user={session.user} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await vi.waitFor(() => {
      expect(testState.authClient.signOut).toHaveBeenCalledOnce();
      expect(queryClient.getQueryData(dashboardSessionQueryOptions().queryKey)).toBeNull();
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: authQueryKeys.all,
      });
      expect(testState.toast.success).toHaveBeenCalledWith("Signed out", {
        description: "You have been returned to the login page",
      });
      expect(testState.navigate).toHaveBeenCalledWith({
        to: "/login",
        search: {
          redirect: "/",
        },
        replace: true,
      });
    });
  });

  it("renders language selection as a compact toggle group", () => {
    const queryClient = new QueryClient();
    const session = {
      user: {
        id: "user-1",
        name: "Tocsin Owner",
        email: "owner@example.test",
        image: null,
        role: "owner",
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <DashboardUserMenuClient user={session.user} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("group", { name: "Language" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "简体中文" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("renders the sidebar variant inside a sidebar provider", () => {
    const queryClient = new QueryClient();
    const session = {
      user: {
        id: "user-1",
        name: "Tocsin Owner",
        email: "owner@example.test",
        image: null,
        role: "owner",
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <SidebarProvider>
            <DashboardUserMenuClient user={session.user} variant="sidebar" />
          </SidebarProvider>
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeTruthy();
    expect(screen.getAllByText("Tocsin Owner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("owner@example.test").length).toBeGreaterThan(0);
  });

  it("exposes a colocated skeleton", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <DashboardUserMenu.Skeleton />
      </AppIntlProvider>,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
