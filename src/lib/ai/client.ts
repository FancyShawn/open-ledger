import OpenAI from 'openai'
import type { AIConfig } from '@/types'
import { getAIConfig } from '@/lib/storage/json-store'

let clientInstance: OpenAI | null = null
let cachedConfig: AIConfig | null = null

export async function getAIClient(): Promise<OpenAI> {
  const config = (await getAIConfig()) as AIConfig

  if (
    clientInstance &&
    cachedConfig &&
    cachedConfig.base_url === config.base_url &&
    cachedConfig.api_key === config.api_key
  ) {
    return clientInstance
  }

  clientInstance = new OpenAI({
    apiKey: config.api_key,
    baseURL: config.base_url,
  })
  cachedConfig = config
  return clientInstance
}

export async function getModelConfig(): Promise<{ model: string; temperature: number }> {
  const config = (await getAIConfig()) as AIConfig
  return { model: config.model, temperature: config.temperature }
}
