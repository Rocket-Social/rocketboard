// Tool definitions for the ai-agent-run edge function.
// Per PRD §10 + §22.1.
//
// Each tool has:
//   - name (canonical wire name in Anthropic tool_use)
//   - description (sent to the model in the tools array)
//   - input_schema (JSON schema, sent to the model + used for validation)
//   - mutates (true → goes to awaiting_approval; false → auto-applies)
//
// The capability whitelist on a persona (ai_personas.capabilities text[])
// gates which tools the worker exposes to the model. The reflective
// denylist (PRD §17 R9) is enforced inline below: agents may not edit
// description/retro fields on cards. v1 doesn't have RPCs that touch
// those fields, but we keep the denylist for forward safety as new
// tools are added.

export type ToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
  mutates: boolean
}

export const REFLECTIVE_DENYLIST = new Set([
  // Card fields agents may not touch — Scrum Master red-line per PRD §17 R9.
  'description',
  'retro_what_went_well',
  'retro_what_could_improve',
  'retro_action_items',
])

export const V1_TOOLS: ToolDefinition[] = [
  {
    name: 'add_comment',
    description:
      'Post a markdown comment on a card. Non-mutating — auto-applies (no approval required). The comment appears in the card thread attributed to your persona.',
    mutates: false,
    input_schema: {
      type: 'object',
      required: ['card_id', 'body_md'],
      properties: {
        card_id: {type: 'string', format: 'uuid'},
        body_md: {type: 'string', maxLength: 5000},
        mention_user_ids: {
          type: 'array',
          items: {type: 'string', format: 'uuid'},
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'set_card_status',
    description:
      "Change a card's status (e.g., 'In progress', 'Done'). Mutating — requires user approval.",
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['card_id', 'status_option_id'],
      properties: {
        card_id: {type: 'string', format: 'uuid'},
        status_option_id: {type: 'string', format: 'uuid'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'set_card_priority',
    description:
      "Change a card's priority. Mutating — requires user approval.",
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['card_id', 'priority_option_id'],
      properties: {
        card_id: {type: 'string', format: 'uuid'},
        priority_option_id: {type: 'string', format: 'uuid'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'set_card_assignee',
    description:
      "Change a card's assignee. Mutating — requires user approval. Refuses bot-to-bot reassignment to prevent loops.",
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['card_id'],
      properties: {
        card_id: {type: 'string', format: 'uuid'},
        assignee_user_id: {type: ['string', 'null'], format: 'uuid'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'attach_subtask',
    description:
      'Create a child card under the parent card. Useful for breaking work into smaller pieces. Mutating — requires user approval.',
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['parent_card_id', 'title'],
      properties: {
        parent_card_id: {type: 'string', format: 'uuid'},
        title: {type: 'string', maxLength: 500},
        body_md: {type: 'string', maxLength: 10000},
        assignee_user_id: {type: ['string', 'null'], format: 'uuid'},
        priority_option_id: {type: ['string', 'null'], format: 'uuid'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_card_in_project',
    description:
      'Create a sibling card in the target project (no parent). Use this for filing top-N items as cards from a template. Mutating — requires user approval.',
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['target_project_id', 'title'],
      properties: {
        target_project_id: {type: 'string', format: 'uuid'},
        title: {type: 'string', maxLength: 500},
        body_md: {type: 'string', maxLength: 10000},
        assignee_user_id: {type: ['string', 'null'], format: 'uuid'},
        priority_option_id: {type: ['string', 'null'], format: 'uuid'},
        status_option_id: {type: ['string', 'null'], format: 'uuid'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'fetch_url',
    description:
      'Fetch the contents of an external URL. Non-mutating — auto-applies. URL host must be in the org allowlist; SSRF-protected; 1MB hard cap; 10s timeout; text-only content types.',
    mutates: false,
    input_schema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {type: 'string', format: 'uri', maxLength: 2048},
        max_response_bytes: {type: 'integer', minimum: 1024, maximum: 1048576},
        timeout_ms: {type: 'integer', minimum: 1000, maximum: 10000},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'send_inbox_message',
    description:
      'Send a Rocketboard inbox notification to a specific user. Use this to bring a user back to a card or summary that needs their attention. Mutating — requires user approval. The inbox `kind` is recorded as `agent_inbox_message`. `link` should be a relative path (e.g., "/p/<project-slug>/c/<card-number>"); the system prepends APP_URL.',
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['target_user_id', 'title', 'body_md'],
      properties: {
        target_user_id: {type: 'string', format: 'uuid'},
        title: {type: 'string', maxLength: 200},
        body_md: {type: 'string', maxLength: 2000},
        link: {type: 'string', maxLength: 2048},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'send_email',
    description:
      'Send an actionable email to a specific user. Use sparingly — emails reach external inboxes, so prefer send_inbox_message for in-app reach. Mutating — requires user approval. `sections` is an array of {heading, items[]} where each item is {text, action_label?, action_url?}; action_url is a relative path (e.g., "/p/<project-slug>/c/<card-number>") that becomes a button in the rendered email.',
    mutates: true,
    input_schema: {
      type: 'object',
      required: ['target_user_id', 'subject', 'sections'],
      properties: {
        target_user_id: {type: 'string', format: 'uuid'},
        subject: {type: 'string', maxLength: 200},
        sections: {
          type: 'array',
          // Deep shape (heading + items[]) is enforced server-side in
          // the send-agent-email edge function; the lightweight
          // validator only checks `array`-ness here.
        },
      },
      additionalProperties: false,
    },
  },
]

export function getToolByName(name: string): ToolDefinition | undefined {
  return V1_TOOLS.find((tool) => tool.name === name)
}

export function isToolEnabledForPersona(
  toolName: string,
  capabilities: readonly string[],
): boolean {
  if (!Array.isArray(capabilities) || capabilities.length === 0) return false
  return capabilities.includes(toolName)
}

// Lightweight schema validation. Full JSON-schema validation is a
// 30kb+ dep and these schemas are deliberately small + structurally
// simple, so we hand-roll: required keys present, types match, length
// + uuid + uri caps respected. Anything else (additionalProperties
// strictness) is enforced by `additionalProperties: false` being
// passed to the model — the model rarely emits stray fields. If the
// model does, we strip them via the typed access pattern below.
export type ValidationResult = {ok: true} | {ok: false; reason: string}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateToolArgs(toolName: string, args: unknown): ValidationResult {
  const tool = getToolByName(toolName)
  if (!tool) return {ok: false, reason: 'unknown_tool'}

  if (!args || typeof args !== 'object') return {ok: false, reason: 'args_not_object'}
  const argsObj = args as Record<string, unknown>

  const schema = tool.input_schema as {
    required?: string[]
    properties?: Record<string, {type?: string | string[]; format?: string; maxLength?: number; minimum?: number; maximum?: number; items?: {type?: string; format?: string}}>
  }

  for (const requiredKey of schema.required ?? []) {
    if (argsObj[requiredKey] === undefined) {
      return {ok: false, reason: `missing_required:${requiredKey}`}
    }
  }

  for (const [key, value] of Object.entries(argsObj)) {
    if (REFLECTIVE_DENYLIST.has(key)) {
      return {ok: false, reason: `reflective_denylist:${key}`}
    }

    const propSchema = schema.properties?.[key]
    if (!propSchema) continue // unknown key — silently allow; we read only via the typed shape downstream

    if (value === null) {
      if (Array.isArray(propSchema.type) ? !propSchema.type.includes('null') : propSchema.type !== 'null') {
        return {ok: false, reason: `null_not_allowed:${key}`}
      }
      continue
    }

    const expectedTypes = Array.isArray(propSchema.type) ? propSchema.type : (propSchema.type ? [propSchema.type] : [])
    const actualType = typeof value === 'object'
      ? (Array.isArray(value) ? 'array' : 'object')
      : typeof value
    const actualTypeForJson =
      actualType === 'number' && Number.isInteger(value)
        ? ['number', 'integer']
        : [actualType]

    const typeOk =
      expectedTypes.length === 0
      || expectedTypes.some((t) => t === 'null' || actualTypeForJson.includes(t))
    if (!typeOk) {
      return {ok: false, reason: `wrong_type:${key}`}
    }

    if (typeof value === 'string') {
      if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
        return {ok: false, reason: `too_long:${key}`}
      }
      if (propSchema.format === 'uuid' && !UUID_RE.test(value)) {
        return {ok: false, reason: `invalid_uuid:${key}`}
      }
      if (propSchema.format === 'uri' && !/^https?:\/\//i.test(value)) {
        return {ok: false, reason: `invalid_uri:${key}`}
      }
    }

    if (typeof value === 'number') {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        return {ok: false, reason: `too_small:${key}`}
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        return {ok: false, reason: `too_large:${key}`}
      }
    }

    if (Array.isArray(value) && propSchema.items) {
      for (const item of value) {
        if (propSchema.items.format === 'uuid' && (typeof item !== 'string' || !UUID_RE.test(item))) {
          return {ok: false, reason: `invalid_uuid_item:${key}`}
        }
      }
    }
  }

  return {ok: true}
}

export function buildAnthropicToolsParam(capabilities: readonly string[]): unknown[] {
  return V1_TOOLS
    .filter((tool) => isToolEnabledForPersona(tool.name, capabilities))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }))
}
