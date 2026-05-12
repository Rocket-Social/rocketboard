/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../test/queryClient";
import { AiChatDrawer } from "./AiChatDrawer";

import {
  AI_PERSONA_PHASE1_DEFAULTS,
  type AiConversation,
  type AiMessage,
  type AiPersona,
  type SurfaceContext,
} from "../ai.types";

const ORG_ID = "55555555-5555-4555-8555-555555555555";
const PAGE_ID = "44444444-4444-4444-8444-444444444444";
const NEXT_PAGE_ID = "77777777-7777-4777-8777-777777777777";

const {
  sendChatMessageMock,
  useConversationsQueryMock,
  useMessagesQueryMock,
  usePersonasQueryMock,
} = vi.hoisted(() => ({
  sendChatMessageMock: vi.fn(),
  useConversationsQueryMock: vi.fn(),
  useMessagesQueryMock: vi.fn(),
  usePersonasQueryMock: vi.fn(),
}));

vi.mock("../../../components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="ai-dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../ai-chat.repository", () => ({
  sendChatMessage: sendChatMessageMock,
}));

vi.mock("../ai.queries", () => ({
  aiKeys: {
    conversations: (
      userId: string,
      surface?: string,
      surfaceResourceId?: string,
    ) => ["ai", "conversations", userId, surface, surfaceResourceId],
    messages: (conversationId: string) => ["ai", "messages", conversationId],
  },
  useConversationsQuery: useConversationsQueryMock,
  useMessagesQuery: useMessagesQueryMock,
  usePersonasQuery: usePersonasQueryMock,
}));

vi.mock("./AiChatInput", () => ({
  AiChatInput: ({
    onSend,
  }: {
    onSend: (message: string) => void;
  }) => (
    <button onClick={() => onSend("Summarize")} type="button">
      Send test message
    </button>
  ),
}));

vi.mock("./AiMessageList", () => ({
  AiMessageList: ({
    messages,
  }: {
    messages: Array<{ content: string }>;
  }) => (
    <div data-testid="message-list">
      {messages.map((message) => message.content).join(" | ")}
    </div>
  ),
}));

vi.mock("./ConversationHistory", () => ({
  ConversationHistory: ({
    conversations,
    onSelect,
  }: {
    conversations: Array<{ id: string }>;
    onSelect: (conversationId: string) => void;
  }) => (
    <button
      onClick={() => {
        if (conversations[0]) {
          onSelect(conversations[0].id);
        }
      }}
      type="button"
    >
      Select conversation
    </button>
  ),
}));

vi.mock("./PersonaSwitcher", () => ({
  PersonaSwitcher: ({
    currentPersona,
  }: {
    currentPersona: { name: string };
  }) => <div>{currentPersona.name}</div>,
}));

function makePersona(): AiPersona {
  return {
    ...AI_PERSONA_PHASE1_DEFAULTS,
    accentColor: "orange",
    avatarUrl: null,
    createdAt: "2026-04-08T12:00:00.000Z",
    createdBy: null,
    fallbackCredentialKind: null,
    fallbackModel: null,
    fallbackProvider: null,
    focusArea: "Assistant",
    id: "persona-1",
    isDefault: true,
    isEnabled: true,
    maxRunsPerHour: 60,
    model: "gpt-5.4",
    name: "Andy",
    organizationId: ORG_ID,
    primaryCredentialKind: "api_key",
    provider: "openai",
    slug: "andy",
    systemPrompt: "Be helpful",
    updatedAt: "2026-04-08T12:00:00.000Z",
  };
}

function makeConversation(): AiConversation {
  return {
    createdAt: "2026-04-08T12:00:00.000Z",
    id: "conversation-1",
    personaId: "persona-1",
    surface: "wiki",
    surfaceResourceId: `wiki:page:${PAGE_ID}`,
    title: "Roadmap review",
    updatedAt: "2026-04-08T12:00:00.000Z",
    userId: "user-1",
  };
}

function makeMessage(): AiMessage {
  return {
    content: "Stored assistant reply",
    conversationId: "conversation-1",
    createdAt: "2026-04-08T12:00:00.000Z",
    id: "message-1",
    metadata: {},
    role: "assistant",
    toolCalls: [],
  };
}

function renderDrawer({
  suggestedPrompts = ["Summarize this wiki page"],
  surface = "wiki",
  surfaceContext = {
    resourceId: `wiki:page:${PAGE_ID}`,
    wikiView: "page",
  } as SurfaceContext,
}: {
  suggestedPrompts?: string[];
  surface?: "global" | "notes" | "project" | "wiki" | "card";
  surfaceContext?: SurfaceContext;
} = {}) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <AiChatDrawer
        isOpen
        onClose={vi.fn()}
        organizationId={ORG_ID}
        suggestedPrompts={suggestedPrompts}
        surface={surface}
        surfaceContext={surfaceContext}
        userId="user-1"
      />
    </QueryClientProvider>,
  );
}

describe("AiChatDrawer", () => {
  beforeEach(() => {
    sendChatMessageMock.mockReset();
    useConversationsQueryMock.mockReset();
    useMessagesQueryMock.mockReset();
    usePersonasQueryMock.mockReset();

    usePersonasQueryMock.mockReturnValue({
      data: [makePersona()],
    });
    useConversationsQueryMock.mockReturnValue({
      data: [makeConversation()],
    });
    useMessagesQueryMock.mockImplementation(
      (conversationId: string | null) => ({
        data: conversationId ? [makeMessage()] : [],
      }),
    );
  });

  it("passes the wiki resource id into conversation queries and renders custom prompts", () => {
    renderDrawer({
      suggestedPrompts: ["Summarize this wiki page"],
      surfaceContext: {
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiView: "page",
      },
    });

    expect(useConversationsQueryMock).toHaveBeenCalledWith(
      "user-1",
      "wiki",
      `wiki:page:${PAGE_ID}`,
    );
    expect(screen.getByText("Summarize this wiki page")).toBeInTheDocument();
    expect(
      screen.queryByText("Draft a wiki page from recent notes"),
    ).not.toBeInTheDocument();
  });

  it("resets the selected conversation when the wiki resource changes", async () => {
    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AiChatDrawer
          isOpen
          onClose={vi.fn()}
          organizationId={ORG_ID}
          suggestedPrompts={["Summarize this wiki page"]}
          surface="wiki"
          surfaceContext={{
            resourceId: `wiki:page:${PAGE_ID}`,
            wikiView: "page",
          }}
          userId="user-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select conversation" }));
    expect(screen.getByTestId("message-list")).toHaveTextContent(
      "Stored assistant reply",
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <AiChatDrawer
          isOpen
          onClose={vi.fn()}
          organizationId={ORG_ID}
          suggestedPrompts={["Summarize this wiki page"]}
          surface="wiki"
          surfaceContext={{
            resourceId: `wiki:page:${NEXT_PAGE_ID}`,
            wikiView: "page",
          }}
          userId="user-1"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("message-list")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Summarize this wiki page")).toBeInTheDocument();
    expect(useConversationsQueryMock).toHaveBeenLastCalledWith(
      "user-1",
      "wiki",
      `wiki:page:${NEXT_PAGE_ID}`,
    );
  });

  it("aborts an in-flight stream and ignores stale callbacks when the wiki resource changes", async () => {
    let capturedSignal: AbortSignal | undefined;
    let capturedCallbacks:
      | {
          onComplete: (fullText: string, conversationId: string) => void;
          onToken: (token: string) => void;
        }
      | undefined;

    sendChatMessageMock.mockImplementation(
      (
        params: { signal?: AbortSignal },
        callbacks: {
          onComplete: (fullText: string, conversationId: string) => void;
          onToken: (token: string) => void;
        },
      ) => {
        capturedSignal = params.signal;
        capturedCallbacks = callbacks;
        return new Promise(() => undefined);
      },
    );

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AiChatDrawer
          isOpen
          onClose={vi.fn()}
          organizationId={ORG_ID}
          suggestedPrompts={["Summarize this wiki page"]}
          surface="wiki"
          surfaceContext={{
            resourceId: `wiki:page:${PAGE_ID}`,
            wikiView: "page",
          }}
          userId="user-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));

    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <AiChatDrawer
          isOpen
          onClose={vi.fn()}
          organizationId={ORG_ID}
          suggestedPrompts={["Summarize this wiki page"]}
          surface="wiki"
          surfaceContext={{
            resourceId: `wiki:page:${NEXT_PAGE_ID}`,
            wikiView: "page",
          }}
          userId="user-1"
        />
      </QueryClientProvider>,
    );

    expect(capturedSignal?.aborted).toBe(true);

    capturedCallbacks?.onToken("stale reply");
    capturedCallbacks?.onComplete("stale reply", "conversation-2");

    expect(screen.queryByText("stale reply")).not.toBeInTheDocument();
    expect(screen.getByText("Summarize this wiki page")).toBeInTheDocument();
  });

  it("keeps project and notes surfaces working without a resource id", () => {
    renderDrawer({
      surface: "notes",
      surfaceContext: {
        activeNoteTitle: "Daily sync",
      },
      suggestedPrompts: ["Organize notes in this folder"],
    });

    expect(useConversationsQueryMock).toHaveBeenCalledWith(
      "user-1",
      "notes",
      undefined,
    );
  });
});
