export interface GenerateRequest {
  storyTitle: string
  summary: string
  acceptanceCriteria: string
  description?: string
  additionalInfo?: string
  provider?: ModelProvider
  model?: string
}

export type ModelProvider = 'groq' | 'openai' | 'anthropic'

export interface ModelOption {
  provider: ModelProvider
  model: string
  label: string
  configured: boolean
}

export interface ModelsResponse {
  models: ModelOption[]
  defaultSelection: ModelOption | null
}

export interface TestCase {
  id: string
  title: string
  steps: string[]
  testData?: string
  expectedResult: string
  category: string
}

export interface GenerateResponse {
  cases: TestCase[]
  model?: string
  promptTokens: number
  completionTokens: number
}

export interface JiraCredentials {
  baseUrl: string
  email: string
  apiToken: string
}

export interface JiraStory {
  id: string
  key: string
  title: string
  summary: string
  description: string
  status: string
  issueType: string
  priority: string
  updated: string
  url: string
}

export interface JiraConnectionResponse {
  displayName: string
  stories: JiraStory[]
}