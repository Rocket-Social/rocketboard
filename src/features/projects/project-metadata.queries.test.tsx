/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../test/queryClient";
import type {
  CardRecord,
  ProjectPriorityOption,
  ProjectStatusOption,
} from "../cards/card.types";
import {
  useAddStatusOptionMutation,
  useDeletePriorityOptionMutation,
  useDeleteStatusOptionMutation,
  useRenamePriorityOptionMutation,
} from "./project-metadata.queries";

const {
  addPriorityOptionMock,
  addStatusOptionMock,
  deletePriorityOptionMock,
  deleteProjectMock,
  deleteStatusOptionMock,
  renamePriorityOptionMock,
  renameProjectMock,
  renameStatusOptionMock,
  setBuiltinFieldLabelMock,
  setPriorityOptionColorMock,
  setStatusOptionColorMock,
} = vi.hoisted(() => ({
  addPriorityOptionMock: vi.fn(),
  addStatusOptionMock: vi.fn(),
  deletePriorityOptionMock: vi.fn(),
  deleteProjectMock: vi.fn(),
  deleteStatusOptionMock: vi.fn(),
  renamePriorityOptionMock: vi.fn(),
  renameProjectMock: vi.fn(),
  renameStatusOptionMock: vi.fn(),
  setBuiltinFieldLabelMock: vi.fn(),
  setPriorityOptionColorMock: vi.fn(),
  setStatusOptionColorMock: vi.fn(),
}));

vi.mock("./project-metadata.repository", () => ({
  projectMetadataRepository: {
    addPriorityOption: addPriorityOptionMock,
    addStatusOption: addStatusOptionMock,
    deletePriorityOption: deletePriorityOptionMock,
    deleteProject: deleteProjectMock,
    deleteStatusOption: deleteStatusOptionMock,
    renamePriorityOption: renamePriorityOptionMock,
    renameProject: renameProjectMock,
    renameStatusOption: renameStatusOptionMock,
    setBuiltinFieldLabel: setBuiltinFieldLabelMock,
    setPriorityOptionColor: setPriorityOptionColorMock,
    setStatusOptionColor: setStatusOptionColorMock,
  },
}));

function createQueryClient() {
  return createTestQueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function makeCardRecord(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: "Test User",
    assigneeUserId: null,
    bodyJson: { content: [], type: "doc" },
    bodyMd: "",
    completedAt: null,
    createdAt: "2026-04-05T12:00:00.000Z",
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: "card-1",
    initiativeId: null,
    priorityOptionId: "priority-1",
    projectId: "project-1",
    sprintId: null,
    startAt: null,
    statusOptionId: "status-1",
    statusPosition: 0,
    tags: [],
    title: "Card 1",
    ...overrides,
  };
}

function makeStatusOption(
  overrides: Partial<ProjectStatusOption> = {},
): ProjectStatusOption {
  return {
    category: "not_started",
    color: null,
    id: "status-1",
    isDefault: true,
    key: "todo",
    label: "Todo",
    position: 0,
    ...overrides,
  };
}

function makePriorityOption(
  overrides: Partial<ProjectPriorityOption> = {},
): ProjectPriorityOption {
  return {
    color: null,
    id: "priority-1",
    isDefault: true,
    key: "medium",
    label: "Medium",
    sortOrder: 0,
    ...overrides,
  };
}

function AddStatusHarness() {
  const mutation = useAddStatusOptionMutation("project-1");
  const [status, setStatus] = useState("idle");

  return (
    <>
      <button
        onClick={() => {
          void mutation
            .mutateAsync({ category: "started", label: "In progress" })
            .then(() => setStatus("resolved"));
        }}
        type="button"
      >
        Add status
      </button>
      <span>{status}</span>
    </>
  );
}

function RenamePriorityHarness() {
  const mutation = useRenamePriorityOptionMutation("project-1");

  return (
    <button
      onClick={() =>
        mutation.mutate({ newLabel: "Critical", optionId: "priority-1" })
      }
      type="button"
    >
      Rename priority
    </button>
  );
}

function DeleteStatusHarness() {
  const mutation = useDeleteStatusOptionMutation("project-1");
  const [status, setStatus] = useState("idle");

  return (
    <>
      <button
        onClick={() => {
          void mutation
            .mutateAsync("status-1")
            .then(() => setStatus("resolved"));
        }}
        type="button"
      >
        Delete status
      </button>
      <span>{status}</span>
    </>
  );
}

function DeletePriorityHarness() {
  const mutation = useDeletePriorityOptionMutation("project-1");
  const [status, setStatus] = useState("idle");

  return (
    <>
      <button
        onClick={() => {
          void mutation
            .mutateAsync("priority-1")
            .then(() => setStatus("resolved"));
        }}
        type="button"
      >
        Delete priority
      </button>
      <span>{status}</span>
    </>
  );
}

describe("project metadata mutations", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    addPriorityOptionMock.mockReset();
    addStatusOptionMock.mockReset();
    deletePriorityOptionMock.mockReset();
    deleteProjectMock.mockReset();
    deleteStatusOptionMock.mockReset();
    renamePriorityOptionMock.mockReset();
    renameProjectMock.mockReset();
    renameStatusOptionMock.mockReset();
    setBuiltinFieldLabelMock.mockReset();
    setPriorityOptionColorMock.mockReset();
    setStatusOptionColorMock.mockReset();
  });

  it("resolves add-status mutations without waiting for background invalidation", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    const invalidateDeferred = deferredPromise<void>();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation((filters) => {
        const queryKey = (
          filters as { queryKey?: readonly unknown[] } | undefined
        )?.queryKey;

        if (queryKey?.[0] === "project" && queryKey?.[1] === "status-options") {
          return invalidateDeferred.promise as ReturnType<
            typeof queryClient.invalidateQueries
          >;
        }

        return Promise.resolve() as ReturnType<
          typeof queryClient.invalidateQueries
        >;
      });

    queryClient.setQueryData<ProjectStatusOption[]>(
      ["project", "status-options", "project-1"],
      [makeStatusOption()],
    );
    addStatusOptionMock.mockResolvedValue(
      makeStatusOption({
        category: "started",
        id: "status-2",
        isDefault: false,
        key: "in_progress",
        label: "In progress",
        position: 0,
      }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <AddStatusHarness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Add status" }));

    await waitFor(() =>
      expect(screen.getAllByText("resolved")).toHaveLength(1),
    );
    expect(
      queryClient.getQueryData<ProjectStatusOption[]>([
        "project", "status-options",
        "project-1",
      ]),
    ).toEqual([
      expect.objectContaining({ id: "status-1" }),
      expect.objectContaining({ id: "status-2", label: "In progress" }),
    ]);

    invalidateDeferred.resolve();
    invalidateSpy.mockRestore();
  });

  it("rolls back optimistic priority renames when the mutation fails", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    const renameDeferred = deferredPromise<void>();

    queryClient.setQueryData<ProjectPriorityOption[]>(
      ["project", "priority-options", "project-1"],
      [makePriorityOption()],
    );
    renamePriorityOptionMock.mockReturnValue(renameDeferred.promise);

    render(
      <QueryClientProvider client={queryClient}>
        <RenamePriorityHarness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Rename priority" }));

    await waitFor(() => {
      expect(
        queryClient.getQueryData<ProjectPriorityOption[]>([
          "project", "priority-options",
          "project-1",
        ])?.[0]?.label,
      ).toBe("Critical");
    });

    renameDeferred.reject(new Error("rename failed"));

    await waitFor(() => {
      expect(
        queryClient.getQueryData<ProjectPriorityOption[]>([
          "project", "priority-options",
          "project-1",
        ])?.[0]?.label,
      ).toBe("Medium");
    });
  });

  it("does not locally guess card reassignment when deleting a status option", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    const invalidateDeferred = deferredPromise<void>();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(
        () =>
          invalidateDeferred.promise as ReturnType<
            typeof queryClient.invalidateQueries
          >,
      );

    queryClient.setQueryData<ProjectStatusOption[]>(
      ["project", "status-options", "project-1"],
      [
        makeStatusOption(),
        makeStatusOption({
          category: "completed",
          id: "status-2",
          isDefault: false,
          key: "done",
          label: "Done",
          position: 0,
        }),
      ],
    );
    queryClient.setQueryData<CardRecord[]>(
      ["project", "cards", "project-1"],
      [makeCardRecord({ statusOptionId: "status-1" })],
    );
    deleteStatusOptionMock.mockResolvedValue({
      reassignedCount: 1,
      reassignedTo: "Done",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DeleteStatusHarness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete status" }));

    await waitFor(() =>
      expect(screen.getAllByText("resolved")).toHaveLength(1),
    );
    expect(
      queryClient.getQueryData<ProjectStatusOption[]>([
        "project", "status-options",
        "project-1",
      ]),
    ).toEqual([expect.objectContaining({ id: "status-2" })]);
    expect(
      queryClient.getQueryData<CardRecord[]>([
        "project", "cards",
        "project-1",
      ])?.[0]?.statusOptionId,
    ).toBe("status-1");

    invalidateDeferred.resolve();
    invalidateSpy.mockRestore();
  });

  it("does not locally guess card reassignment when deleting a priority option", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    const invalidateDeferred = deferredPromise<void>();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(
        () =>
          invalidateDeferred.promise as ReturnType<
            typeof queryClient.invalidateQueries
          >,
      );

    queryClient.setQueryData<ProjectPriorityOption[]>(
      ["project", "priority-options", "project-1"],
      [
        makePriorityOption(),
        makePriorityOption({
          color: "red",
          id: "priority-2",
          isDefault: false,
          key: "high",
          label: "High",
          sortOrder: 1,
        }),
      ],
    );
    queryClient.setQueryData<CardRecord[]>(
      ["project", "cards", "project-1"],
      [makeCardRecord({ priorityOptionId: "priority-1" })],
    );
    deletePriorityOptionMock.mockResolvedValue({ reassignedCount: 1 });

    render(
      <QueryClientProvider client={queryClient}>
        <DeletePriorityHarness />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete priority" }));

    await waitFor(() =>
      expect(screen.getAllByText("resolved")).toHaveLength(1),
    );
    expect(
      queryClient.getQueryData<ProjectPriorityOption[]>([
        "project", "priority-options",
        "project-1",
      ]),
    ).toEqual([expect.objectContaining({ id: "priority-2" })]);
    expect(
      queryClient.getQueryData<CardRecord[]>([
        "project", "cards",
        "project-1",
      ])?.[0]?.priorityOptionId,
    ).toBe("priority-1");

    invalidateDeferred.resolve();
    invalidateSpy.mockRestore();
  });

});
