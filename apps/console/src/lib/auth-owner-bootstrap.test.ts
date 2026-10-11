import { APIError } from "better-auth/api";
import { describe, expect, it } from "vite-plus/test";

import { assignOwnerRoleBeforeUserCreate } from "#/lib/auth-owner-bootstrap";

const user = {
  id: "user-1",
  name: "Tocsin Owner",
  email: "owner@example.test",
};

describe("auth owner bootstrap", () => {
  it("assigns the first registered user the owner role", async () => {
    await expect(
      assignOwnerRoleBeforeUserCreate(user, {
        hasRegisteredUsers: async () => false,
      }),
    ).resolves.toEqual({
      data: {
        ...user,
        role: "owner",
      },
    });
  });

  it("rejects later dashboard self-registration attempts", async () => {
    await expect(
      assignOwnerRoleBeforeUserCreate(user, {
        hasRegisteredUsers: async () => true,
      }),
    ).rejects.toMatchObject({
      message: "Owner user already exists",
    });

    await expect(
      assignOwnerRoleBeforeUserCreate(user, {
        hasRegisteredUsers: async () => true,
      }),
    ).rejects.toBeInstanceOf(APIError);
  });
});
