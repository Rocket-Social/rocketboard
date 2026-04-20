import {builtinFieldDefinitions, type ProjectBuiltinFieldLabels} from './builtin-fields'

export type ProjectBuiltinOptionLabels = Record<string, never>

export type ParsedProjectBuiltinOptionConfig = {
  builtinFieldLabels: ProjectBuiltinFieldLabels
  builtinOptionLabels: ProjectBuiltinOptionLabels
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readBuiltinFieldLabels(value: unknown): ProjectBuiltinFieldLabels {
  if (!isPlainObject(value)) {
    return {}
  }

  const result: ProjectBuiltinFieldLabels = {}

  for (const definition of builtinFieldDefinitions) {
    const rawLabel = value[definition.key]
    if (typeof rawLabel !== 'string') {
      continue
    }

    const normalizedLabel = rawLabel.trim()
    if (!normalizedLabel) {
      continue
    }

    result[definition.key] = normalizedLabel
  }

  return result
}

export function parseProjectBuiltinOptionConfig(value: unknown): ParsedProjectBuiltinOptionConfig {
  const source = isPlainObject(value) ? value : {}

  return {
    builtinFieldLabels: readBuiltinFieldLabels(source),
    builtinOptionLabels: {},
  }
}
