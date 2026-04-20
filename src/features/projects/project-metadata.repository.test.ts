import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcCallMock } = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
}));

vi.mock("../../platform/data/rpc-adapter", () => ({
  rpcAdapter: {
    call: rpcCallMock,
  },
}));

import { projectMetadataRepository } from "./project-metadata.repository";

describe("projectMetadataRepository.deleteProject", () => {
  beforeEach(() => {
    rpcCallMock.mockReset();
    rpcCallMock.mockResolvedValue(undefined);
  });

  it("calls the delete project RPC", async () => {
    await projectMetadataRepository.deleteProject("project-1");

    expect(rpcCallMock).toHaveBeenCalledWith("delete_project", {
      target_project_id: "project-1",
    });
  });
});
