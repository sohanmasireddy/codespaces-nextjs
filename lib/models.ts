export const models = [
  {
    id: '@cf/qwen/qwen3.8-27b',
    name: 'Qwen 3.8',
    description: 'Vision · configurable reasoning',
    vision: true,
    modes: ['auto', 'fast', 'thinking'],
    thinkingLevels: ['low', 'medium', 'maximum'],
  },
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    name: 'Gemma 4',
    description: 'Vision · thinking on or off',
    vision: true,
    modes: ['auto', 'fast', 'thinking'],
    thinkingLevels: [],
  },
  {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout',
    description: 'Vision · no reasoning control',
    vision: true,
    modes: ['auto', 'fast'],
    thinkingLevels: [],
  },
] as const

export type ModelId = (typeof models)[number]['id']
export type ResponseMode = 'auto' | 'fast' | 'thinking'
export type ThinkingLevel = 'low' | 'medium' | 'maximum'

export const defaultModelId: ModelId = models[0].id

export function getModel(modelId: unknown) {
  return models.find((model) => model.id === modelId)
}

export function supportsMode(modelId: ModelId, mode: ResponseMode) {
  return getModel(modelId)?.modes.some((availableMode) => availableMode === mode) ?? false
}

export function buildModelParameters(
  modelId: ModelId,
  mode: ResponseMode,
  thinkingLevel: ThinkingLevel,
) {
  const parameters: Record<string, unknown> = {
    max_tokens: mode === 'fast' ? 512 : 2048,
  }

  if (modelId === '@cf/qwen/qwen3.8-27b') {
    if (mode === 'fast') {
      parameters.chat_template_kwargs = { enable_thinking: false }
    } else {
      parameters.reasoning_effort =
        thinkingLevel === 'maximum' ? 'xhigh' : thinkingLevel
      parameters.chat_template_kwargs = { enable_thinking: true }
    }
  }

  if (modelId === '@cf/google/gemma-4-26b-a4b-it') {
    if (mode !== 'auto') {
      parameters.chat_template_kwargs = {
        enable_thinking: mode === 'thinking',
      }
    }
  }

  return parameters
}
