import {
  GenerateRequest,
  GenerateResponse,
  JiraConnectionResponse,
  JiraCredentials,
  JiraStory,
  ModelsResponse
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export async function getModels(): Promise<ModelsResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/models`)
  } catch {
    throw new Error(`Cannot reach the backend at ${API_BASE_URL}. Check that the backend server is running.`)
  }

  if (!response.ok) {
    throw new Error(`Could not load configured AI models (HTTP ${response.status})`)
  }

  return response.json() as Promise<ModelsResponse>
}

export async function generateTests(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const data: GenerateResponse = await response.json()
    return data
  } catch (error) {
    console.error('Error generating tests:', error)
    throw error instanceof Error ? error : new Error('Unknown error occurred')
  }
}

function getTextFromJiraDocument(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  const document = value as { content?: unknown[]; text?: string }
  if (typeof document.text === 'string') return document.text
  if (!Array.isArray(document.content)) return ''

  return document.content.map(getTextFromJiraDocument).filter(Boolean).join(' ').trim()
}

export async function connectToJira(credentials: JiraCredentials): Promise<JiraConnectionResponse> {
  const baseUrl = credentials.baseUrl.replace(/\/+$/, '')
  const jiraApiBase = import.meta.env.DEV ? '/jira-api' : baseUrl
  const authorization = `Basic ${btoa(`${credentials.email}:${credentials.apiToken}`)}`
  const headers = {
    Accept: 'application/json',
    Authorization: authorization,
  }

  try {
    const profileResponse = await fetch(`${jiraApiBase}/rest/api/3/myself`, { headers })
    if (!profileResponse.ok) {
      const errorData = await profileResponse.json().catch(() => ({ errorMessages: [] }))
      throw new Error(errorData.errorMessages?.[0] || `Could not connect to Jira (HTTP ${profileResponse.status})`)
    }

    const profile = await profileResponse.json() as { displayName?: string; emailAddress?: string }
    const jql = encodeURIComponent('issuetype in (Story, "User Story") ORDER BY updated DESC')
    const storiesResponse = await fetch(
      `${jiraApiBase}/rest/api/3/search/jql?jql=${jql}&maxResults=50&fields=summary,description,status,issuetype,priority,updated`,
      { headers },
    )
    if (!storiesResponse.ok) {
      const errorData = await storiesResponse.json().catch(() => ({ errorMessages: [] }))
      throw new Error(errorData.errorMessages?.[0] || `Could not load Jira stories (HTTP ${storiesResponse.status})`)
    }

    const data = await storiesResponse.json() as {
      issues?: Array<{
        id: string
        key: string
        fields?: {
          summary?: string
          description?: unknown
          status?: { name?: string }
          issuetype?: { name?: string }
          priority?: { name?: string }
          updated?: string
        }
      }>
    }

    const stories: JiraStory[] = (data.issues || []).map(issue => ({
      id: issue.id,
      key: issue.key,
      title: issue.fields?.summary || 'Untitled story',
      summary: issue.fields?.summary || '',
      description: getTextFromJiraDocument(issue.fields?.description),
      status: issue.fields?.status?.name || 'Unknown',
      issueType: issue.fields?.issuetype?.name || 'Story',
      priority: issue.fields?.priority?.name || 'Unprioritized',
      updated: issue.fields?.updated || '',
      url: `${baseUrl}/browse/${issue.key}`,
    }))

    return {
      displayName: profile.displayName || profile.emailAddress || credentials.email,
      stories,
    }
  } catch (error) {
    console.error('Error connecting to Jira:', error)
    throw error instanceof Error ? error : new Error('Unable to connect to Jira')
  }
}