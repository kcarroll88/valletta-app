import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import useIsMobile from '../hooks/useIsMobile'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso.replace('T', ' ').slice(0, 10))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

// Map mime_type → { label, color }
function mimeInfo(mimeType) {
  if (!mimeType) return { label: 'FILE', color: '#9595b8' }
  if (mimeType.includes('pdf'))                                   return { label: 'PDF',  color: '#f87171' }
  if (mimeType.includes('document') || mimeType.includes('word')) return { label: 'DOC',  color: '#60a5fa' }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return { label: 'XLS', color: '#4ade80' }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { label: 'PPT', color: '#fb923c' }
  if (mimeType.startsWith('image/'))                              return { label: 'IMG',  color: '#a78bfa' }
  if (mimeType.startsWith('video/'))                              return { label: 'VID',  color: '#38bdf8' }
  if (mimeType.startsWith('audio/'))                              return { label: 'AUD',  color: '#a89fff' }
  return { label: 'FILE', color: '#9595b8' }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FileBadge({ mimeType }) {
  const { label, color } = mimeInfo(mimeType)
  return (
    <span style={{
      background: `${color}22`,
      border: `1px solid ${color}44`,
      color,
      fontSize: 9,
      fontWeight: 700,
      padding: '2px 5px',
      borderRadius: 4,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      flexShrink: 0,
      minWidth: 34,
      textAlign: 'center',
    }}>
      {label}
    </span>
  )
}

function FolderRow({ folder, depth, isActive, isExpanded, onSelect, onToggle }) {
  const hasChildren = folder.children && folder.children.length > 0
  const indent = depth * 14

  return (
    <>
      <div
        onClick={() => onSelect(folder)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `6px 12px 6px ${12 + indent}px`,
          cursor: 'pointer',
          borderRadius: 6,
          margin: '1px 6px',
          background: isActive ? 'rgba(124,106,247,0.15)' : 'transparent',
          borderLeft: isActive ? '2px solid #a89fff' : '2px solid transparent',
          transition: 'background 0.12s',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.background = 'transparent'
        }}
      >
        {/* Expand/collapse arrow or spacer */}
        <span
          onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(folder.id) }}
          style={{
            fontSize: 9,
            color: hasChildren ? 'rgba(255,255,255,0.4)' : 'transparent',
            width: 12,
            flexShrink: 0,
            cursor: hasChildren ? 'pointer' : 'default',
            transition: 'transform 0.15s',
            display: 'inline-block',
            transform: hasChildren && isExpanded ? 'rotate(90deg)' : 'none',
          }}
        >
          ▶
        </span>

        <span style={{
          fontSize: 12,
          color: isActive ? '#c4baff' : 'rgba(255,255,255,0.75)',
          fontWeight: isActive ? 500 : 400,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {folder.name}
        </span>

        {folder.file_count != null && (
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.25)',
            flexShrink: 0,
          }}>
            {folder.file_count}
          </span>
        )}
      </div>

      {/* Recurse into children if expanded */}
      {hasChildren && isExpanded && folder.children.map(child => (
        <FolderRow
          key={child.id}
          folder={child}
          depth={depth + 1}
          isActive={isActive && false /* parent handles active */}
          isExpanded={false}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

function FolderTree({ tree, activeFolderId, onSelect }) {
  const [expanded, setExpanded] = useState({})

  const toggleExpand = useCallback((id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // Separate "Uncategorized" from the rest
  const mainFolders = tree.filter(f => !f.uncategorized)
  const uncategorized = tree.find(f => f.uncategorized)

  const renderFolder = (folder, depth = 0) => {
    const hasChildren = folder.children && folder.children.length > 0
    const isExp = !!expanded[folder.id]
    const isActive = activeFolderId === folder.id

    return (
      <div key={folder.id}>
        <div
          onClick={() => onSelect(folder)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: `6px 12px 6px ${12 + depth * 14}px`,
            cursor: 'pointer',
            borderRadius: 6,
            margin: '1px 6px',
            background: isActive ? 'rgba(124,106,247,0.15)' : 'transparent',
            borderLeft: isActive ? '2px solid #a89fff' : '2px solid transparent',
            transition: 'background 0.12s',
            userSelect: 'none',
          }}
          onMouseEnter={e => {
            if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={e => {
            if (!isActive) e.currentTarget.style.background = 'transparent'
          }}
        >
          <span
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(folder.id) }}
            style={{
              fontSize: 9,
              color: hasChildren ? 'rgba(255,255,255,0.4)' : 'transparent',
              width: 12,
              flexShrink: 0,
              cursor: hasChildren ? 'pointer' : 'default',
              display: 'inline-block',
              transition: 'transform 0.15s',
              transform: hasChildren && isExp ? 'rotate(90deg)' : 'none',
            }}
          >
            ▶
          </span>

          <span style={{
            fontSize: 12,
            color: isActive ? '#c4baff' : 'rgba(255,255,255,0.75)',
            fontWeight: isActive ? 500 : 400,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </span>

          {folder.file_count != null && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
              {folder.file_count}
            </span>
          )}
        </div>

        {hasChildren && isExp && folder.children.map(child => renderFolder(child, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 8, paddingBottom: 8 }}>
      {/* Section label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: '0.1em',
        padding: '0 18px',
        marginBottom: 6,
        marginTop: 4,
      }}>
        FOLDERS
      </div>

      {mainFolders.map(folder => renderFolder(folder))}

      {/* Uncategorized divider + row */}
      {uncategorized && (
        <>
          <div style={{
            height: 1,
            background: 'rgba(255,255,255,0.07)',
            margin: '10px 12px',
          }} />
          {renderFolder(uncategorized)}
        </>
      )}
    </div>
  )
}

function FileList({ files, folderName, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
        <div style={{ fontSize: 28, opacity: 0.15 }}>◫</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>No files in this folder</div>
        <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>This folder appears to be empty</div>
      </div>
    )
  }

  return (
    <div>
      {files.map((file, idx) => (
        <div
          key={file.id || idx}
          onClick={() => file.drive_url && window.open(file.drive_url, '_blank')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 14px',
            borderRadius: 6,
            cursor: file.drive_url ? 'pointer' : 'default',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <FileBadge mimeType={file.mime_type} />

          <span style={{
            flex: 1,
            fontSize: 13,
            color: 'rgba(255,255,255,0.75)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {file.name}
          </span>

          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.25)',
            flexShrink: 0,
            minWidth: 52,
            textAlign: 'right',
          }}>
            {fmtDate(file.modified_at)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Files() {
  const isMobile = useIsMobile()
  const [tree,           setTree]           = useState([])
  const [treeLoading,    setTreeLoading]    = useState(true)
  const [treeError,      setTreeError]      = useState(null)
  const [driveConnected, setDriveConnected] = useState(true)

  const [activeFolder,   setActiveFolder]   = useState(null)   // folder object
  const [folderFiles,    setFolderFiles]    = useState([])
  const [filesLoading,   setFilesLoading]   = useState(false)

  const [syncing,        setSyncing]        = useState(false)
  const [syncMsg,        setSyncMsg]        = useState('')
  const [mobileFolderOpen, setMobileFolderOpen] = useState(false)

  // Load drive tree on mount
  useEffect(() => {
    setTreeLoading(true)
    api.driveTree()
      .then(data => {
        // API may return { tree: [...] } or a raw array
        const folders = Array.isArray(data) ? data : (data?.tree || data?.folders || [])
        setTree(folders)
        setDriveConnected(true)

        // Auto-select first folder if present
        if (folders.length > 0) {
          setActiveFolder(folders[0])
        }
      })
      .catch(err => {
        const msg = err?.message || ''
        // 404 = endpoints not built yet, treat as "no data" not an error
        if (msg.includes('404') || msg.includes('500')) {
          setTree([])
          setDriveConnected(true) // assume connected, just no data
        } else if (msg.includes('401') || msg.includes('403')) {
          setDriveConnected(false)
        } else {
          setTree([])
          setDriveConnected(true)
        }
        setTreeError(null) // graceful empty state, not crash
      })
      .finally(() => setTreeLoading(false))
  }, [])

  // Load files when active folder changes
  useEffect(() => {
    if (!activeFolder) {
      setFolderFiles([])
      return
    }
    setFilesLoading(true)
    api.driveFolderFiles(activeFolder.id)
      .then(data => {
        const items = Array.isArray(data) ? data : (data?.files || data?.items || [])
        setFolderFiles(items)
      })
      .catch(() => setFolderFiles([]))
      .finally(() => setFilesLoading(false))
  }, [activeFolder])

  const handleSyncDrive = () => {
    setSyncing(true)
    setSyncMsg('')
    api.syncDrive()
      .then(() => {
        setSyncMsg('Sync complete')
        // Reload tree
        return api.driveTree().then(data => {
          const folders = Array.isArray(data) ? data : (data?.tree || data?.folders || [])
          setTree(folders)
        })
      })
      .catch(() => setSyncMsg('Sync failed — check Drive connection'))
      .finally(() => {
        setSyncing(false)
        setTimeout(() => setSyncMsg(''), 4000)
      })
  }

  const handleSelectFolder = (folder) => {
    setActiveFolder(folder)
  }

  // Drive not connected
  if (!driveConnected) {
    return (
      <div style={{ padding: '32px 40px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Files
        </h1>
        <div style={{
          marginTop: 48,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 32, opacity: 0.2 }}>☁</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            Google Drive not connected — connect it in Integrations
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'integrations' }))}
            style={{
              background: 'rgba(124,106,247,0.15)',
              border: '1px solid rgba(124,106,247,0.35)',
              color: '#a89fff',
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,106,247,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,106,247,0.15)'}
          >
            Go to Integrations
          </button>
        </div>
      </div>
    )
  }

  // Full layout
  return (
    <div style={{ padding: isMobile ? '16px 14px' : '32px 40px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexShrink: 0, ...(isMobile && { paddingTop: 52 }) }}>
        <div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Files
          </h1>
          {syncMsg && (
            <p style={{ color: syncMsg.includes('failed') ? '#f87171' : '#4ade80', marginTop: 4, fontSize: 12 }}>
              {syncMsg}
            </p>
          )}
        </div>

        <button
          onClick={handleSyncDrive}
          disabled={syncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: syncing ? 'rgba(124,106,247,0.08)' : 'rgba(124,106,247,0.12)',
            border: '1px solid rgba(124,106,247,0.3)',
            color: syncing ? 'rgba(168,159,255,0.5)' : '#a89fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            cursor: syncing ? 'not-allowed' : 'pointer',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { if (!syncing) e.currentTarget.style.background = 'rgba(124,106,247,0.2)' }}
          onMouseLeave={e => { if (!syncing) e.currentTarget.style.background = 'rgba(124,106,247,0.12)' }}
        >
          <span style={{
            display: 'inline-block',
            animation: syncing ? 'spin 1s linear infinite' : 'none',
            fontSize: 13,
          }}>
            ↻
          </span>
          {syncing ? 'Syncing…' : 'Sync Drive'}
        </button>
      </div>

      {/* Mobile: folder browse button + bottom-sheet overlay */}
      {isMobile && (
        <div style={{ marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setMobileFolderOpen(true)}
              style={{
                background: 'rgba(124,106,247,0.12)',
                border: '1px solid rgba(124,106,247,0.28)',
                borderRadius: 8,
                color: '#a89fff',
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ◫ Browse Folders
            </button>
            {activeFolder && (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                {activeFolder.name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Mobile folder tree bottom sheet */}
      {isMobile && mobileFolderOpen && (
        <>
          <div
            onClick={() => setMobileFolderOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 500 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
            background: 'rgba(12,12,20,0.97)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: '12px 0 24px',
          }}>
            <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Folders</span>
              <button onClick={() => setMobileFolderOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 20, cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
            <FolderTree
              tree={tree}
              activeFolderId={activeFolder?.id}
              onSelect={(folder) => { handleSelectFolder(folder); setMobileFolderOpen(false) }}
            />
          </div>
        </>
      )}

      {/* Body — sidebar + panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        minHeight: 0,
      }}>

        {/* Folder sidebar — hidden on mobile */}
        {!isMobile && (
        <div style={{
          width: 220,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.03)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto',
        }}>
          {treeLoading ? (
            <div style={{ padding: 20, color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center' }}>
              Loading…
            </div>
          ) : tree.length === 0 ? (
            <div style={{ padding: 20, color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              No folders synced
            </div>
          ) : (
            <FolderTree
              tree={tree}
              activeFolderId={activeFolder?.id}
              onSelect={handleSelectFolder}
            />
          )}
        </div>
        )}

        {/* File panel */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>

          {/* Panel header */}
          {activeFolder ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                {activeFolder.name}
              </span>
              {!filesLoading && (
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  {folderFiles.length} {folderFiles.length === 1 ? 'file' : 'files'}
                </span>
              )}
            </div>
          ) : (
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Select a folder</span>
            </div>
          )}

          {/* No drive data at all */}
          {!treeLoading && tree.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12 }}>
              <div style={{ fontSize: 32, opacity: 0.12 }}>☁</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: 500 }}>
                No Drive files synced yet.
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                Click "Sync Drive" to import your Google Drive files.
              </div>
            </div>
          ) : (
            <div style={{ padding: '6px 8px' }}>
              <FileList
                files={folderFiles}
                folderName={activeFolder?.name}
                loading={filesLoading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Spin keyframe — injected once */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
