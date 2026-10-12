import { useEffect, useState } from 'react'
import { connectToJira, generateTests, getModels } from './api'
import {
  GenerateRequest,
  GenerateResponse,
  JiraCredentials,
  JiraStory,
  ModelOption,
  TestCase
} from './types'

function App() {
  const [formData, setFormData] = useState<GenerateRequest>({
    storyTitle: '',
    summary: '',
    acceptanceCriteria: '',
    description: '',
    additionalInfo: ''
  })
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [results, setResults] = useState<GenerateResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set())
  const [jiraCredentials, setJiraCredentials] = useState<JiraCredentials>({
    baseUrl: import.meta.env.VITE_JIRA_BASE_URL || '',
    email: import.meta.env.VITE_JIRA_EMAIL || '',
    apiToken: import.meta.env.VITE_JIRA_API_KEY || '',
  })
  const [jiraStories, setJiraStories] = useState<JiraStory[]>([])
  const [jiraUser, setJiraUser] = useState<string | null>(null)
  const [jiraError, setJiraError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)
  const [selectedStoryKey, setSelectedStoryKey] = useState<string | null>(null)

  const selectedModel = modelOptions.find(
    option => option.configured && `${option.provider}:${option.model}` === selectedModelKey
  )

  useEffect(() => {
    let isCurrent = true

    const loadModels = async () => {
      try {
        const response = await getModels()
        if (!isCurrent) return

        setModelOptions(response.models)
        const defaultSelection = response.defaultSelection
        const initialSelection = defaultSelection
          ? response.models.find(
              option => option.provider === defaultSelection.provider && option.model === defaultSelection.model
            )
          : response.models.find(option => option.configured)
        if (initialSelection) {
          setSelectedModelKey(`${initialSelection.provider}:${initialSelection.model}`)
        }
      } catch (err) {
        if (isCurrent) {
          setModelsError(err instanceof Error ? err.message : 'Could not load configured AI models')
        }
      } finally {
        if (isCurrent) setIsLoadingModels(false)
      }
    }

    void loadModels()
    return () => {
      isCurrent = false
    }
  }, [])

  const toggleTestCaseExpansion = (testCaseId: string) => {
    const newExpanded = new Set(expandedTestCases)
    if (newExpanded.has(testCaseId)) {
      newExpanded.delete(testCaseId)
    } else {
      newExpanded.add(testCaseId)
    }
    setExpandedTestCases(newExpanded)
  }

  const handleInputChange = (field: keyof GenerateRequest, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleJiraInputChange = (field: keyof JiraCredentials, value: string) => {
    setJiraCredentials(prev => ({ ...prev, [field]: value }))
  }

  const handleConnectJira = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsConnecting(true)
    setJiraError(null)

    try {
      const connection = await connectToJira(jiraCredentials)
      setJiraUser(connection.displayName)
      setJiraStories(connection.stories)
      setSelectedStoryKey(null)
    } catch (err) {
      setJiraStories([])
      setJiraUser(null)
      setJiraError(err instanceof Error ? err.message : 'Could not connect to Jira')
    } finally {
      setIsConnecting(false)
    }
  }

  const selectJiraStory = (story: JiraStory) => {
    setSelectedStoryKey(story.key)
    setFormData(prev => ({
      ...prev,
      storyTitle: `${story.key}: ${story.title}`,
      summary: story.summary,
      description: story.description,
      acceptanceCriteria: story.description || story.summary,
      additionalInfo: `Jira status: ${story.status} | Priority: ${story.priority}`,
    }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedModel) {
      setError(modelsError || 'No AI model is configured. Configure a provider and model on the backend.')
      return
    }

    if (!formData.storyTitle.trim() || !formData.summary.trim() || !formData.acceptanceCriteria.trim()) {
      setError('Story Title, Summary, and Acceptance Criteria are required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await generateTests({
        ...formData,
        provider: selectedModel.provider,
        model: selectedModel.model
      })
      setResults(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests')
    } finally {
      setIsLoading(false)
    }
  }

  const resetAll = () => {
    setFormData({
      storyTitle: '',
      summary: '',
      acceptanceCriteria: '',
      description: '',
      additionalInfo: ''
    })
    setResults(null)
    setError(null)
    setIsLoading(false)
    setExpandedTestCases(new Set())
    setJiraStories([])
    setJiraUser(null)
    setJiraError(null)
    setSelectedStoryKey(null)
  }

  return (
    <div>
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        :root {
          --bg: #f4f7f3;
          --surface: #ffffff;
          --border: #e3e8e0;
          --text: #1f2a24;
          --muted: #6b7a72;
          --brand: #00c853;
          --brand-dark: #009624;
          --brand-darker: #00791d;
          --brand-soft: #e6f7ec;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          color: var(--text);
          line-height: 1.6;
          min-height: 100vh;
          background:
            radial-gradient(900px 500px at 8% -8%, rgba(0,200,83,0.14), transparent 55%),
            radial-gradient(700px 400px at 100% 0%, rgba(0,200,83,0.08), transparent 50%),
            var(--bg);
          background-attachment: fixed;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes floatGlow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .container {
          max-width: 95%;
          width: 100%;
          margin: 0 auto;
          padding: 24px;
          min-height: 100vh;
        }

        @media (min-width: 768px) { .container { max-width: 92%; padding: 36px; } }
        @media (min-width: 1024px) { .container { max-width: 90%; padding: 44px; } }
        @media (min-width: 1600px) { .container { max-width: 1600px; padding: 52px; } }

        .header {
          position: relative;
          text-align: center;
          margin-bottom: 40px;
          animation: fadeUp 0.6s ease both;
        }

        .reset-btn {
          position: absolute;
          top: 0;
          right: 0;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.9);
          color: var(--text);
          border-radius: 999px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 6px 16px rgba(31, 42, 36, 0.06);
        }

        .reset-btn:hover {
          background: var(--brand-soft);
          border-color: rgba(0, 200, 83, 0.3);
          color: var(--brand-darker);
          transform: translateY(-1px);
        }

        .badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 999px;
          background: var(--brand-soft);
          border: 1px solid rgba(0,200,83,0.35);
          color: var(--brand-darker);
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 18px;
        }

        .badge-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--brand);
          box-shadow: 0 0 12px var(--brand);
          animation: floatGlow 2.4s ease-in-out infinite;
        }

        .title {
          font-size: clamp(2.1rem, 5vw, 3.2rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
          margin-bottom: 12px;
        }
        .title .accent { color: var(--brand-dark); }

        .subtitle {
          color: var(--muted);
          font-size: 1.05rem;
          max-width: 560px;
          margin: 0 auto;
        }

        /* Side-by-side workspace — always two columns on desktop */
        .workspace {
          display: grid;
          grid-template-columns: 1fr;
          gap: 26px;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .workspace {
            grid-template-columns: minmax(440px, 520px) 1fr;
          }
        }
        @media (min-width: 1600px) {
          .workspace {
            grid-template-columns: minmax(520px, 600px) 1fr;
          }
        }

        .jira-panel {
          background: #18251f;
          color: #f4fbf5;
          border-radius: 18px;
          padding: 24px;
          margin-bottom: 26px;
          box-shadow: 0 14px 34px rgba(31,42,36,0.16);
          animation: fadeUp 0.6s ease both;
        }

        .jira-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .jira-kicker {
          color: #8ee3a9;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .jira-title { font-size: 1.25rem; font-weight: 750; margin-bottom: 4px; }
        .jira-subtitle { color: #b6c9bc; font-size: 13px; }

        .jira-status {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #b6c9bc;
          font-size: 12px;
          border: 1px solid #3a5245;
          border-radius: 999px;
          padding: 7px 11px;
        }
        .jira-status.connected { color: #9ff0b4; border-color: #4c9e62; }
        .jira-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #82978a; }
        .jira-status.connected .jira-status-dot { background: #55d477; box-shadow: 0 0 10px #55d477; }

        .jira-form {
          display: grid;
          grid-template-columns: 1.35fr 1fr 1fr auto;
          gap: 10px;
          align-items: end;
        }

        .jira-field { min-width: 0; }
        .jira-field label {
          display: block;
          color: #b6c9bc;
          font-size: 11px;
          font-weight: 700;
          margin: 0 0 6px 2px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .jira-input {
          width: 100%;
          border: 1px solid #3a5245;
          border-radius: 9px;
          background: #24362c;
          color: #f4fbf5;
          padding: 11px 12px;
          font: inherit;
          font-size: 13px;
        }
        .jira-input::placeholder { color: #82978a; }
        .jira-input:focus { outline: none; border-color: #55d477; box-shadow: 0 0 0 3px rgba(85,212,119,0.18); }

        .connect-btn {
          min-height: 42px;
          border: 0;
          border-radius: 9px;
          padding: 0 18px;
          background: #55d477;
          color: #102217;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }
        .connect-btn:hover:not(:disabled) { background: #78e596; }
        .connect-btn:disabled { opacity: 0.65; cursor: wait; }

        .jira-error { color: #ffb4ab; font-size: 13px; margin-top: 13px; }
        .jira-stories { border-top: 1px solid #3a5245; margin-top: 20px; padding-top: 18px; }
        .jira-stories-heading { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 10px; }
        .jira-stories-heading strong { font-size: 14px; }
        .jira-stories-heading span { color: #8fa99a; font-size: 12px; }
        .story-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 9px; max-height: 260px; overflow-y: auto; }
        .story-card {
          text-align: left;
          border: 1px solid #3a5245;
          border-radius: 10px;
          background: #213229;
          color: #f4fbf5;
          padding: 12px;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, transform 0.2s;
        }
        .story-card:hover { border-color: #55d477; background: #294036; transform: translateY(-1px); }
        .story-card.selected { border-color: #55d477; background: #2d4938; box-shadow: inset 3px 0 #55d477; }
        .story-card-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .story-key { color: #8ee3a9; font-size: 11px; font-weight: 800; }
        .story-status { color: #b6c9bc; font-size: 11px; }
        .story-card-title { font-size: 13px; font-weight: 700; line-height: 1.35; }
        .story-card-description { color: #b6c9bc; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 12px; margin-top: 5px; }

        @media (max-width: 820px) {
          .jira-form { grid-template-columns: 1fr 1fr; }
          .connect-btn { width: 100%; }
        }
        @media (max-width: 520px) {
          .jira-panel-header { flex-direction: column; }
          .jira-form { grid-template-columns: 1fr; }
        }

        .form-container {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(31,42,36,0.06);
          animation: fadeUp 0.6s ease 0.08s both;
        }
        @media (min-width: 1024px) {
          .form-container {
            position: sticky;
            top: 24px;
          }
        }

        .form-group { margin-bottom: 16px; }
        .form-group:last-of-type { margin-bottom: 0; }

        .form-label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text);
          font-size: 14px;
        }
        .form-label .req { color: var(--brand-dark); margin-left: 3px; }

        .model-status {
          margin-top: 7px;
          color: #65736a;
          font-size: 12px;
          line-height: 1.45;
        }
        .model-status.error { color: #a33527; }
        .model-select { cursor: pointer; }
        .model-select:disabled { cursor: not-allowed; opacity: 0.7; }

        .form-input, .form-textarea {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 11px;
          font-size: 14px;
          color: var(--text);
          background: #fbfdfa;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          font-family: inherit;
        }

        .form-input::placeholder, .form-textarea::placeholder { color: #9aa89f; }

        .form-input:focus, .form-textarea:focus {
          outline: none;
          border-color: var(--brand);
          background: #fff;
          box-shadow: 0 0 0 4px rgba(0,200,83,0.18);
        }

        .form-textarea { resize: none; min-height: 96px; }
        .form-textarea.tall { min-height: 120px; }

        .submit-btn {
          margin-top: 20px;
          width: 100%;
          background: linear-gradient(120deg, var(--brand), var(--brand-dark));
          color: #fff;
          border: none;
          padding: 13px 28px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.25s ease, filter 0.2s;
          box-shadow: 0 8px 22px rgba(0,200,83,0.35);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(0,200,83,0.45);
          filter: brightness(1.03);
        }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }

        .submit-btn:disabled {
          cursor: not-allowed;
          background: #c6d4bb;
          box-shadow: none;
        }

        .btn-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.5);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .output-col { min-width: 0; }

        .error-banner {
          background: #fdeceb;
          border: 1px solid #f5c2be;
          color: #b3261e;
          padding: 14px 18px;
          border-radius: 12px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: fadeUp 0.3s ease both;
        }

        .placeholder-card {
          background:
            radial-gradient(400px 200px at 50% 0%, rgba(0,200,83,0.08), transparent 70%),
            var(--surface);
          border: 1px dashed rgba(0,200,83,0.45);
          border-radius: 18px;
          padding: 72px 34px;
          text-align: center;
          color: var(--muted);
          min-height: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          animation: fadeUp 0.5s ease both;
        }
        .placeholder-icon {
          width: 76px;
          height: 76px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          background: var(--brand-soft);
          border: 1px solid rgba(0,200,83,0.35);
          margin-bottom: 20px;
          animation: floatGlow 3s ease-in-out infinite;
        }
        .placeholder-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 8px;
        }
        .placeholder-text { max-width: 360px; font-size: 14.5px; }
        .placeholder-hints {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin-top: 22px;
        }
        .placeholder-hints .meta-chip { background: #f3f6ef; }

        .loading {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          text-align: center;
          padding: 56px 30px;
          color: var(--muted);
          font-size: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          box-shadow: 0 10px 30px rgba(31,42,36,0.06);
        }
        .loading .big-spinner {
          width: 42px; height: 42px;
          border: 3px solid rgba(0,200,83,0.2);
          border-top-color: var(--brand-dark);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .results-container {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 30px;
          box-shadow: 0 10px 30px rgba(31,42,36,0.06);
          animation: fadeUp 0.5s ease both;
        }

        .results-header {
          margin-bottom: 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--border);
        }

        .results-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 12px;
        }

        .results-meta { display: flex; flex-wrap: wrap; gap: 8px; }
        .meta-chip {
          font-size: 12.5px;
          color: var(--brand-darker);
          background: var(--brand-soft);
          border: 1px solid rgba(0,200,83,0.3);
          padding: 5px 12px;
          border-radius: 999px;
          font-weight: 600;
        }

        .table-container { overflow-x: auto; border-radius: 12px; }

        .results-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin-top: 6px;
        }

        .results-table th {
          background: #f6f9f2;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          font-size: 11.5px;
          letter-spacing: 0.06em;
          padding: 13px 14px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }

        .results-table td {
          padding: 14px;
          text-align: left;
          border-bottom: 1px solid #eef1ec;
          color: var(--text);
          font-size: 14px;
          vertical-align: top;
        }

        .results-table tbody tr.row-main { transition: background 0.15s; }
        .results-table tbody tr.row-main:hover { background: #f7faf3; }

        .cat-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid transparent;
          text-transform: capitalize;
        }
        .category-positive { color: #1f8a4c; background: #e6f6ec; border-color: #b7e4c7; }
        .category-negative { color: #c0392b; background: #fdecea; border-color: #f5c2be; }
        .category-edge { color: #b8860b; background: #fcf3d9; border-color: #f0dca0; }
        .category-authorization { color: #7d3cc0; background: #f3e9fb; border-color: #ddc6f2; }
        .category-non-functional { color: #2b6cb0; background: #e7f0fa; border-color: #c0d8f0; }

        .test-case-id {
          cursor: pointer;
          color: var(--brand-darker);
          font-weight: 700;
          padding: 6px 10px;
          border-radius: 8px;
          transition: background-color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .test-case-id:hover { background: var(--brand-soft); }
        .test-case-id.expanded { background: var(--brand-soft); }

        .expand-icon {
          font-size: 9px;
          transition: transform 0.2s;
          color: var(--muted);
        }
        .expand-icon.expanded { transform: rotate(90deg); color: var(--brand-dark); }

        .expanded-details {
          margin-top: 8px;
          background: #f8faf5;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          animation: fadeUp 0.3s ease both;
        }

        .details-title { margin-bottom: 16px; color: var(--text); font-size: 15px; font-weight: 700; }

        .step-item {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .step-item:hover {
          border-color: var(--brand);
          box-shadow: 0 4px 12px rgba(0,200,83,0.15);
        }

        .step-header {
          display: grid;
          grid-template-columns: 70px 1fr 1fr 1fr;
          gap: 15px;
          align-items: start;
        }

        .step-id {
          font-weight: 700;
          color: #fff;
          background: linear-gradient(120deg, var(--brand), var(--brand-dark));
          padding: 5px 8px;
          border-radius: 8px;
          text-align: center;
          font-size: 12px;
        }
        .step-description { color: var(--text); line-height: 1.5; font-size: 13.5px; }
        .step-test-data { color: var(--muted); font-style: italic; font-size: 13px; }
        .step-expected { color: #1f8a4c; font-weight: 500; font-size: 13px; }

        .step-labels {
          display: grid;
          grid-template-columns: 70px 1fr 1fr 1fr;
          gap: 15px;
          margin-bottom: 12px;
          font-weight: 700;
          color: var(--muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
      `}</style>

      <div className="container">
        <div className="header">
          <button type="button" className="reset-btn" onClick={resetAll}>
            Reset
          </button>
          <span className="badge-pill">
            <span className="badge-dot"></span>
            AI-Powered Test Generation
          </span>
          <h1 className="title">User Story to <span className="accent">Tests</span></h1>
          <p className="subtitle">Turn user stories into comprehensive, structured test cases in seconds.</p>
        </div>

        <section className="jira-panel" aria-labelledby="jira-title">
          <div className="jira-panel-header">
            <div>
              <div className="jira-kicker">Issue source</div>
              <h2 id="jira-title" className="jira-title">Connect Jira</h2>
              <p className="jira-subtitle">Bring your latest user stories into the test generation workspace.</p>
            </div>
            <div className={`jira-status ${jiraUser ? 'connected' : ''}`}>
              <span className="jira-status-dot"></span>
              {jiraUser ? `Connected as ${jiraUser}` : 'Not connected'}
            </div>
          </div>

          <form className="jira-form" onSubmit={handleConnectJira}>
            <div className="jira-field">
              <label htmlFor="jiraBaseUrl">Jira base URL</label>
              <input
                id="jiraBaseUrl"
                className="jira-input"
                type="url"
                value={jiraCredentials.baseUrl}
                onChange={(e) => handleJiraInputChange('baseUrl', e.target.value)}
                placeholder="https://company.atlassian.net"
                required
              />
            </div>
            <div className="jira-field">
              <label htmlFor="jiraEmail">Email ID</label>
              <input
                id="jiraEmail"
                className="jira-input"
                type="email"
                value={jiraCredentials.email}
                onChange={(e) => handleJiraInputChange('email', e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="jira-field">
              <label htmlFor="jiraApiToken">Jira API key</label>
              <input
                id="jiraApiToken"
                className="jira-input"
                type="password"
                value={jiraCredentials.apiToken}
                onChange={(e) => handleJiraInputChange('apiToken', e.target.value)}
                placeholder="Paste API key"
                required
              />
            </div>
            <button type="submit" className="connect-btn" disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : jiraUser ? 'Refresh stories' : 'Connect Jira'}
            </button>
          </form>

          {jiraError && <div className="jira-error" role="alert">{jiraError}</div>}

          {jiraUser && (
            <div className="jira-stories">
              <div className="jira-stories-heading">
                <strong>User stories from Jira</strong>
                <span>{jiraStories.length} {jiraStories.length === 1 ? 'story' : 'stories'} found</span>
              </div>
              {jiraStories.length > 0 ? (
                <div className="story-list">
                  {jiraStories.map(story => (
                    <button
                      type="button"
                      className={`story-card ${selectedStoryKey === story.key ? 'selected' : ''}`}
                      key={story.key}
                      onClick={() => selectJiraStory(story)}
                    >
                      <div className="story-card-top">
                        <span className="story-key">{story.key}</span>
                        <span className="story-status">{story.status}</span>
                      </div>
                      <div className="story-card-title">{story.title}</div>
                      {story.description && <div className="story-card-description">{story.description}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="jira-subtitle">No Story issues were found in this Jira project.</p>
              )}
            </div>
          )}
        </section>

        <div className="workspace">
          <form onSubmit={handleSubmit} className="form-container">
            <div className="form-group">
              <label htmlFor="aiModel" className="form-label">
                AI Model
              </label>
              <select
                id="aiModel"
                className="form-input model-select"
                value={selectedModelKey}
                onChange={event => setSelectedModelKey(event.target.value)}
                disabled={isLoadingModels || isLoading}
              >
                <option value="" disabled>
                  {isLoadingModels ? 'Loading available models...' : 'Select a configured model'}
                </option>
                {modelOptions.map(option => (
                  <option
                    key={option.provider}
                    value={`${option.provider}:${option.model}`}
                    disabled={!option.configured}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              <p
                className={`model-status ${modelsError || (!isLoadingModels && !modelOptions.some(option => option.configured)) ? 'error' : ''}`}
                role="status"
                aria-live="polite"
              >
                {isLoadingModels
                  ? 'Loading models from the backend...'
                  : modelsError || (!modelOptions.some(option => option.configured)
                    ? 'No models are configured. Add a provider API key and model ID to the backend environment, then restart the server.'
                    : selectedModel
                      ? `Selected: ${selectedModel.label}`
                      : 'Choose a configured model; unavailable providers are shown as placeholders.')}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="storyTitle" className="form-label">
                Story Title <span className="req">*</span>
              </label>
              <input
                type="text"
                id="storyTitle"
                className="form-input"
                value={formData.storyTitle}
                onChange={(e) => handleInputChange('storyTitle', e.target.value)}
                placeholder="Enter the user story title..."
                required
                spellCheck={false}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
            </div>

            <div className="form-group">
              <label htmlFor="summary" className="form-label">
                Summary <span className="req">*</span>
              </label>
              <textarea
                id="summary"
                className="form-textarea"
                value={formData.summary}
                onChange={(e) => handleInputChange('summary', e.target.value)}
                placeholder="Enter a brief user story summary..."
                required
                spellCheck={false}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description" className="form-label">
                Description
              </label>
              <textarea
                id="description"
                className="form-textarea tall"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Additional description (optional)..."
                spellCheck={false}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
            </div>

            <div className="form-group">
              <label htmlFor="acceptanceCriteria" className="form-label">
                Acceptance Criteria <span className="req">*</span>
              </label>
              <textarea
                id="acceptanceCriteria"
                className="form-textarea tall"
                value={formData.acceptanceCriteria}
                onChange={(e) => handleInputChange('acceptanceCriteria', e.target.value)}
                placeholder="Enter the acceptance criteria..."
                required
                spellCheck={false}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
            </div>

            <div className="form-group">
              <label htmlFor="additionalInfo" className="form-label">
                Additional Info
              </label>
              <textarea
                id="additionalInfo"
                className="form-textarea"
                value={formData.additionalInfo}
                onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
                placeholder="Any additional information (optional)..."
                spellCheck={false}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading || isLoadingModels || !selectedModel}
            >
              {isLoading && <span className="btn-spinner"></span>}
              {isLoading ? 'Generating...' : '✨ Generate Test Cases'}
            </button>
          </form>

          <div className="output-col">
              {error && (
                <div className="error-banner">
                  <span>⚠️</span>
                  {error}
                </div>
              )}

              {isLoading && (
                <div className="loading">
                  <span className="big-spinner"></span>
                  Generating test cases...
                </div>
              )}

              {!isLoading && !results && !error && (
                <div className="placeholder-card">
                  <div className="placeholder-icon">🧪</div>
                  <div className="placeholder-title">Your test cases will appear here</div>
                  <p className="placeholder-text">
                    Fill in the story details on the left and hit Generate. We'll craft
                    positive, negative, edge, and more test cases for you.
                  </p>
                  <div className="placeholder-hints">
                    <span className="meta-chip">Positive</span>
                    <span className="meta-chip">Negative</span>
                    <span className="meta-chip">Edge</span>
                    <span className="meta-chip">Authorization</span>
                  </div>
                </div>
              )}

              {!isLoading && results && (
                <div className="results-container">
                  <div className="results-header">
                    <h2 className="results-title">Generated Test Cases</h2>
                    <div className="results-meta">
                      <span className="meta-chip">{results.cases.length} test case(s)</span>
                      {results.model && <span className="meta-chip">Model: {results.model}</span>}
                      {results.promptTokens > 0 && (
                        <span className="meta-chip">Tokens: {results.promptTokens + results.completionTokens}</span>
                      )}
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th>Test Case ID</th>
                          <th>Title</th>
                          <th>Category</th>
                          <th>Expected Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.cases.map((testCase: TestCase) => (
                          <>
                            <tr key={testCase.id} className="row-main">
                              <td>
                                <div
                                  className={`test-case-id ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}
                                  onClick={() => toggleTestCaseExpansion(testCase.id)}
                                >
                                  <span className={`expand-icon ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}>
                                    ▶
                                  </span>
                                  {testCase.id}
                                </div>
                              </td>
                              <td>{testCase.title}</td>
                              <td>
                                <span className={`cat-badge category-${testCase.category.toLowerCase()}`}>
                                  {testCase.category}
                                </span>
                              </td>
                              <td>{testCase.expectedResult}</td>
                            </tr>
                            {expandedTestCases.has(testCase.id) && (
                              <tr key={`${testCase.id}-details`}>
                                <td colSpan={4}>
                                  <div className="expanded-details">
                                    <h4 className="details-title">Test Steps for {testCase.id}</h4>
                                    <div className="step-labels">
                                      <div>Step ID</div>
                                      <div>Step Description</div>
                                      <div>Test Data</div>
                                      <div>Expected Result</div>
                                    </div>
                                    {testCase.steps.map((step, index) => (
                                      <div key={index} className="step-item">
                                        <div className="step-header">
                                          <div className="step-id">S{String(index + 1).padStart(2, '0')}</div>
                                          <div className="step-description">{step}</div>
                                          <div className="step-test-data">{testCase.testData || 'N/A'}</div>
                                          <div className="step-expected">
                                            {index === testCase.steps.length - 1 ? testCase.expectedResult : 'Step completed successfully'}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  )
}

export default App
