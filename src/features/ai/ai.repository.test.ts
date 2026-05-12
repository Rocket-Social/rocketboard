import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  eqMock,
  fromMock,
  limitMock,
  orderMock,
  selectMock,
  getSupabaseBrowserClientMock,
} = vi.hoisted(() => ({
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
  limitMock: vi.fn(),
  orderMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("../../platform/supabase/client", () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}));

import { listConversations } from "./ai.repository";

const PAGE_ID = "44444444-4444-4444-8444-444444444444";

function setupQuery(data: unknown[] = []) {
  const query = {
    eq: eqMock,
    limit: limitMock,
    order: orderMock,
    select: selectMock,
    then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };

  selectMock.mockReturnValue(query);
  eqMock.mockReturnValue(query);
  orderMock.mockReturnValue(query);
  limitMock.mockReturnValue(query);
  fromMock.mockReturnValue(query);
  getSupabaseBrowserClientMock.mockReturnValue({ from: fromMock });

  return query;
}

describe("ai repository conversations", () => {
  beforeEach(() => {
    eqMock.mockReset();
    fromMock.mockReset();
    getSupabaseBrowserClientMock.mockReset();
    limitMock.mockReset();
    orderMock.mockReset();
    selectMock.mockReset();
  });

  it("filters conversations by surface resource id when provided", async () => {
    setupQuery();

    await listConversations("user-1", "wiki", `wiki:page:${PAGE_ID}`);

    expect(fromMock).toHaveBeenCalledWith("ai_conversations");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqMock).toHaveBeenCalledWith("surface", "wiki");
    expect(eqMock).toHaveBeenCalledWith(
      "surface_resource_id",
      `wiki:page:${PAGE_ID}`,
    );
  });

  it("leaves resource id unfiltered for existing project and notes surfaces", async () => {
    setupQuery();

    await listConversations("user-1", "project");

    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqMock).toHaveBeenCalledWith("surface", "project");
    expect(eqMock).not.toHaveBeenCalledWith(
      "surface_resource_id",
      expect.anything(),
    );
  });
});
