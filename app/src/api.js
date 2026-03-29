const BASE = '/api'

function getToken() {
  return localStorage.getItem('vlt_token') || ''
}

async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // Auth
  login:           (password)     => req('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  verify:          ()             => req('/auth/verify'),
  googleLoginStart: ()            => fetch('/api/auth/google/start').then(r => r.json()),

  // Data
  dashboard:       ()             => req('/dashboard'),

  files:           (params = {})  => req('/files?' + new URLSearchParams(params)),
  file:            (id)           => req(`/files/${id}`),
  fileCategories:  ()             => req('/files/categories/list'),
  togglePin:       (id)           => req(`/files/${id}/pin`, { method: 'PATCH' }),
  driveFiles:      (p = {})       => req(`/drive?${new URLSearchParams(p)}`),
  toggleDrivePin:  (id)           => req(`/drive/${id}/pin`, { method: 'PATCH' }),

  // Drive browser (folder tree)
  driveTree:    () => req('/drive/tree'),
  driveFolderFiles: (folderId) => req(`/drive/files${folderId != null ? `?folder_id=${folderId}` : ''}`),
  driveFolders: () => req('/drive/folders'),
  syncDrive:    () => req('/drive/sync', { method: 'POST' }),

  events:          (params = {})  => req('/events?' + new URLSearchParams(params)),
  event:           (id)           => req(`/events/${id}`),
  createEvent:     (body)         => req('/events', { method: 'POST', body: JSON.stringify(body) }),
  updateEvent:     (id, body)     => req(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEvent:     (id)           => req(`/events/${id}`, { method: 'DELETE' }),

  tasks:           (params = {})  => req('/tasks?' + new URLSearchParams(params)),
  task:            (id)           => req(`/tasks/${id}`),
  createTask:      (body)         => req('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask:      (id, body)     => req(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask:      (id)           => req(`/tasks/${id}`, { method: 'DELETE' }),

  sources:         (params = {})  => req('/sources?' + new URLSearchParams(params)),
  source:          (id)           => req(`/sources/${id}`),
  createSource:    (body)         => req('/sources', { method: 'POST', body: JSON.stringify(body) }),
  updateSource:    (id, body)     => req(`/sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSource:    (id)           => req(`/sources/${id}`, { method: 'DELETE' }),

  contacts:        (params = {})  => req('/contacts?' + new URLSearchParams(params)),
  contact:         (id)           => req(`/contacts/${id}`),
  createContact:   (body)         => req('/contacts', { method: 'POST', body: JSON.stringify(body) }),
  updateContact:   (id, body)     => req(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteContact:   (id)           => req(`/contacts/${id}`, { method: 'DELETE' }),

  outreach:        (params = {})  => req('/outreach?' + new URLSearchParams(params)),
  createOutreach:  (body)         => req('/outreach', { method: 'POST', body: JSON.stringify(body) }),
  updateOutreach:  (id, body)     => req(`/outreach/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOutreach:  (id)           => req(`/outreach/${id}`, { method: 'DELETE' }),

  // Integrations
  integrations: {
    status:          ()             => req('/integrations/status'),
    startAuth:       (platform)     => req(`/integrations/auth/start/${platform}`),
    connectDiscord:  (body)         => req('/integrations/auth/discord', { method: 'POST', body: JSON.stringify(body) }),
    disconnect:      (platform)     => req(`/integrations/auth/${platform}`, { method: 'DELETE' }),
    sync:            (platform)     => req(`/integrations/sync/${platform}`, { method: 'POST' }),
    syncAll:         ()             => req('/integrations/sync/all', { method: 'POST' }),
    messages:        (params = {})  => req('/integrations/data/messages?' + new URLSearchParams(params)),
    posts:           (params = {})  => req('/integrations/data/posts?' + new URLSearchParams(params)),
    metrics:         (params = {})  => req('/integrations/data/metrics?' + new URLSearchParams(params)),
  },

  // Ideas
  ideas:          (params = {})  => req('/ideas?' + new URLSearchParams(params)),
  createIdea:     (body)         => req('/ideas', { method: 'POST', body: JSON.stringify(body) }),
  updateIdea:     (id, body)     => req(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteIdea:     (id)           => req(`/ideas/${id}`, { method: 'DELETE' }),
  promoteIdea:    (id)           => req(`/ideas/${id}/promote`, { method: 'POST' }),
  detectIdeasFromDiscord: ()    => req('/ideas/detect-from-discord', { method: 'POST' }),

  // Setlists
  setlists:           ()             => req('/setlists'),
  setlist:            (id)           => req(`/setlists/${id}`),
  createSetlist:      (body)         => req('/setlists', { method: 'POST', body: JSON.stringify(body) }),
  updateSetlist:      (id, body)     => req(`/setlists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSetlist:      (id)           => req(`/setlists/${id}`, { method: 'DELETE' }),
  replaceSetlistSongs:(id, songs)    => req(`/setlists/${id}/songs`, { method: 'PUT', body: JSON.stringify(songs) }),

  // Roadmap
  roadmap: (year = 2026) => req(`/roadmap?year=${year}`),

  // Finance
  finance:      (year) => req(`/finance?year=${year}`),
  financeYears: ()     => req('/finance/years'),
  financeSync:  ()     => req('/finance/sync', { method: 'POST' }),

  // Insights
  insights:           ()         => req('/insights'),
  insightsConnect:    (body)     => req('/insights/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  insightsSync:       ()         => req('/insights/sync', { method: 'POST' }),
  insightsDisconnect: (platform) => req(`/insights/connect/${platform}`, { method: 'DELETE' }),

  // Upload
  uploadFile: (file) => {
    const token = getToken()
    const formData = new FormData()
    formData.append('file', file)
    return fetch('/api/upload', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(res => {
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      return res.json()
    })
  },

  // Chat — returns a fetch Response for streaming
  chatStream: (member, message, history = [], options = {}) => {
    const token = getToken()
    return fetch(BASE + '/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ member, message, history }),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  },
}
