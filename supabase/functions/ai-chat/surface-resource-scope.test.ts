import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  deriveRequestedSurfaceResourceId,
  parseWikiSurfaceResourceId,
  validateConversationResumeScope,
  validateWikiSurfaceResourceScope,
} from "./surface-scope.shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSONA_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PERSONA_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ORG_ID = "66666666-6666-4666-8666-666666666666";
const PAGE_ID = "44444444-4444-4444-8444-444444444444";

describe("ai-chat surface resource scoping", () => {
  it("accepts valid wiki resource ids and rejects malformed or oversized ids", () => {
    expect(
      deriveRequestedSurfaceResourceId("wiki", {
        resourceId: `wiki:page:${PAGE_ID}`,
      }),
    ).toEqual({ ok: true, resourceId: `wiki:page:${PAGE_ID}` });

    expect(
      deriveRequestedSurfaceResourceId("wiki", {
        resourceId: "wiki:page:not-a-uuid",
      }),
    ).toEqual({
      error: "Invalid wiki AI resource id",
      ok: false,
      status: 400,
    });

    expect(deriveRequestedSurfaceResourceId("wiki")).toEqual({
      error: "Invalid wiki AI resource id",
      ok: false,
      status: 400,
    });

    expect(
      deriveRequestedSurfaceResourceId("wiki", {
        resourceId: `wiki:page:${"x".repeat(250)}`,
      }),
    ).toEqual({
      error: "Invalid AI surface resource id",
      ok: false,
      status: 400,
    });
  });

  it("parses wiki resource ids into normalized kind and uuid", () => {
    expect(parseWikiSurfaceResourceId(`wiki:PAGE:${PAGE_ID}`)).toEqual({
      id: PAGE_ID,
      kind: "page",
    });

    expect(
      deriveRequestedSurfaceResourceId("wiki", {
        resourceId: `wiki:PAGE:${PAGE_ID.toUpperCase()}`,
      }),
    ).toEqual({
      ok: true,
      resourceId: `wiki:page:${PAGE_ID}`,
    });

    expect(parseWikiSurfaceResourceId("project:page:whatever")).toBeNull();
  });

  it("rejects conversation resume when persona, surface, or resource scope differs", () => {
    const existingConversation = {
      persona_id: PERSONA_ID,
      surface: "wiki",
      surface_resource_id: `wiki:page:${PAGE_ID}`,
      user_id: USER_ID,
    };

    expect(
      validateConversationResumeScope(existingConversation, {
        personaId: PERSONA_ID,
        surface: "wiki",
        surfaceResourceId: `wiki:page:${PAGE_ID}`,
        userId: USER_ID,
      }),
    ).toEqual({ ok: true });

    expect(
      validateConversationResumeScope(existingConversation, {
        personaId: OTHER_PERSONA_ID,
        surface: "wiki",
        surfaceResourceId: `wiki:page:${PAGE_ID}`,
        userId: USER_ID,
      }),
    ).toEqual({
      error: "Conversation does not match the current AI context",
      ok: false,
      status: 409,
    });

    expect(
      validateConversationResumeScope(existingConversation, {
        personaId: PERSONA_ID,
        surface: "project",
        surfaceResourceId: `wiki:page:${PAGE_ID}`,
        userId: USER_ID,
      }),
    ).toEqual({
      error: "Conversation does not match the current AI context",
      ok: false,
      status: 409,
    });

    expect(
      validateConversationResumeScope(existingConversation, {
        personaId: PERSONA_ID,
        surface: "wiki",
        surfaceResourceId: `wiki:index:${PAGE_ID}`,
        userId: USER_ID,
      }),
    ).toEqual({
      error: "Conversation does not match the current AI context",
      ok: false,
      status: 409,
    });
  });

  it("keeps unauthorized conversations as a 403 instead of leaking scope details", () => {
    expect(
      validateConversationResumeScope(
        {
          persona_id: PERSONA_ID,
          surface: "wiki",
          surface_resource_id: `wiki:page:${PAGE_ID}`,
          user_id: "other-user",
        },
        {
          personaId: PERSONA_ID,
          surface: "wiki",
          surfaceResourceId: `wiki:page:${PAGE_ID}`,
          userId: USER_ID,
        },
      ),
    ).toEqual({
      error: "Conversation not found or not authorized",
      ok: false,
      status: 403,
    });
  });

  it("requires wiki index resources to match the persona organization", () => {
    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "member",
        personaOrganizationId: ORG_ID,
        resourceId: `wiki:index:${ORG_ID}`,
      }),
    ).toEqual({ ok: true });

    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "member",
        personaOrganizationId: ORG_ID,
        resourceId: `wiki:index:${OTHER_ORG_ID}`,
      }),
    ).toEqual({
      error: "Wiki resource is not available to this AI agent",
      ok: false,
      status: 403,
    });

    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "guest",
        personaOrganizationId: ORG_ID,
        resourceId: `wiki:index:${ORG_ID}`,
      }),
    ).toEqual({
      error: "Wiki resource is not available to this AI agent",
      ok: false,
      status: 403,
    });
  });

  it("requires wiki page resources to belong to the persona org and be user-accessible", () => {
    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "member",
        personaOrganizationId: ORG_ID,
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiPage: { organization_id: ORG_ID, project_id: null },
      }),
    ).toEqual({ ok: true });

    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "guest",
        personaOrganizationId: ORG_ID,
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiPage: { organization_id: ORG_ID, project_id: null },
      }),
    ).toEqual({
      error: "Wiki resource is not available to this AI agent",
      ok: false,
      status: 403,
    });

    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "member",
        personaOrganizationId: ORG_ID,
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiPage: { organization_id: OTHER_ORG_ID, project_id: null },
      }),
    ).toEqual({
      error: "Wiki resource is not available to this AI agent",
      ok: false,
      status: 403,
    });

    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "guest",
        personaOrganizationId: ORG_ID,
        projectCanAccess: true,
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiPage: { organization_id: ORG_ID, project_id: PAGE_ID },
      }),
    ).toEqual({ ok: true });

    expect(
      validateWikiSurfaceResourceScope({
        membershipRole: "member",
        personaOrganizationId: ORG_ID,
        projectCanAccess: false,
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiPage: { organization_id: ORG_ID, project_id: PAGE_ID },
      }),
    ).toEqual({
      error: "Wiki resource is not available to this AI agent",
      ok: false,
      status: 403,
    });
  });

  it("validates wiki resource access before persisting messages or calling providers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/ai-chat/index.ts"),
      "utf8",
    );

    const validationIndex = source.indexOf("validateRequestedSurfaceResourceAccess({");
    const messageInsertIndex = source.indexOf(".from('ai_messages')");
    const providerCallIndex = source.indexOf("upstreamResponse = await streamAnthropicResponse(");

    expect(validationIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(messageInsertIndex);
    expect(validationIndex).toBeLessThan(providerCallIndex);
    expect(source).toContain("body.surface !== 'wiki'");
    expect(source).toContain("const providerMessages = buildProviderMessages");
    expect(source).toContain("contextSummary && body.surface !== 'wiki'");
  });
});
