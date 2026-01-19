# Commenting Feature Implementation Plan

## Overview

Add a collaborative commenting system to xo-doc that allows users to:
- Highlight text and attach comments
- Reply in threads
- Attribute comments to guests when not logged in

This plan follows the **external comments** approach (comments stored separately from markdown) based on [community consensus](https://github.com/hedgedoc/hedgedoc/issues/5450).

---

## Architecture Decision

### Why External Comments (Not In-Document)

| Approach | Pros | Cons |
|----------|------|------|
| **External (chosen)** | Clean markdown, proper threading, better UX, independent permissions | Anchor stability challenges, export complexity |
| In-Document (CriticMarkup) | Portable, single file | Pollutes markdown, awkward threading, breaks CommonMark |

**Key insight from HedgeDoc community**: The original floating-comments proposer reconsidered: *"other experiments proved it to be shoe-horning at the wrong level of abstraction"*

---

## Data Model

### Database Schema

```sql
-- New table: comment_thread
CREATE TABLE comment_thread (
  id            SERIAL PRIMARY KEY,
  note_id       INTEGER NOT NULL REFERENCES note(id) ON DELETE CASCADE,

  -- Anchor: where in the document this thread is attached
  anchor_text   TEXT NOT NULL,           -- The highlighted text (for display/recovery)
  anchor_start  INTEGER,                 -- Character offset start (nullable for note-level)
  anchor_end    INTEGER,                 -- Character offset end

  -- Status
  resolved      BOOLEAN DEFAULT FALSE,
  resolved_by   INTEGER REFERENCES "user"(id),
  resolved_at   TIMESTAMP,

  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- New table: comment
CREATE TABLE comment (
  id              SERIAL PRIMARY KEY,
  thread_id       INTEGER NOT NULL REFERENCES comment_thread(id) ON DELETE CASCADE,

  -- Author (nullable for guests)
  author_id       INTEGER REFERENCES "user"(id),
  guest_name      VARCHAR(100),          -- For non-logged-in users
  guest_session   VARCHAR(36),           -- UUID to allow guest to edit their own

  content         TEXT NOT NULL,

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_comment_thread_note_id ON comment_thread(note_id);
CREATE INDEX idx_comment_thread_id ON comment(thread_id);
CREATE INDEX idx_comment_author_id ON comment(author_id);
```

### TypeScript Types

```typescript
// database/src/types/comment-thread.ts
export interface CommentThread {
  [FieldNameCommentThread.id]: number
  [FieldNameCommentThread.noteId]: number
  [FieldNameCommentThread.anchorText]: string
  [FieldNameCommentThread.anchorStart]: number | null
  [FieldNameCommentThread.anchorEnd]: number | null
  [FieldNameCommentThread.resolved]: boolean
  [FieldNameCommentThread.resolvedBy]: number | null
  [FieldNameCommentThread.resolvedAt]: string | null
  [FieldNameCommentThread.createdAt]: string
  [FieldNameCommentThread.updatedAt]: string
}

export enum FieldNameCommentThread {
  id = 'id',
  noteId = 'note_id',
  anchorText = 'anchor_text',
  anchorStart = 'anchor_start',
  anchorEnd = 'anchor_end',
  resolved = 'resolved',
  resolvedBy = 'resolved_by',
  resolvedAt = 'resolved_at',
  createdAt = 'created_at',
  updatedAt = 'updated_at',
}

export const TableCommentThread = 'comment_thread'

// database/src/types/comment.ts
export interface Comment {
  [FieldNameComment.id]: number
  [FieldNameComment.threadId]: number
  [FieldNameComment.authorId]: number | null
  [FieldNameComment.guestName]: string | null
  [FieldNameComment.guestSession]: string | null
  [FieldNameComment.content]: string
  [FieldNameComment.createdAt]: string
  [FieldNameComment.updatedAt]: string
}

export enum FieldNameComment {
  id = 'id',
  threadId = 'thread_id',
  authorId = 'author_id',
  guestName = 'guest_name',
  guestSession = 'guest_session',
  content = 'content',
  createdAt = 'created_at',
  updatedAt = 'updated_at',
}

export const TableComment = 'comment'
```

---

## Backend Implementation

### File Structure

```
backend/src/
├── comments/
│   ├── comments.module.ts
│   ├── comments.service.ts
│   ├── comments.service.spec.ts
│   └── comment-thread.service.ts
├── api/private/comments/
│   └── comments.controller.ts
├── dtos/
│   ├── comment.dto.ts
│   ├── comment-thread.dto.ts
│   ├── create-comment.dto.ts
│   └── create-thread.dto.ts
└── database/migrations/
    └── 2025XXXXXX_add_comments.js
```

### API Endpoints

```
# Comment Threads
GET    /api/private/notes/:noteAlias/threads          # List all threads for a note
POST   /api/private/notes/:noteAlias/threads          # Create new thread with initial comment
PATCH  /api/private/notes/:noteAlias/threads/:id      # Update thread (resolve/unresolve)
DELETE /api/private/notes/:noteAlias/threads/:id      # Delete thread (owner/editor only)

# Comments within Threads
GET    /api/private/threads/:threadId/comments        # List comments in thread
POST   /api/private/threads/:threadId/comments        # Add reply to thread
PATCH  /api/private/comments/:id                      # Edit comment (author only)
DELETE /api/private/comments/:id                      # Delete comment (author/editor)
```

### Permission Model

| Action | Required Permission |
|--------|---------------------|
| View comments | `READ` on note |
| Create thread/comment | `READ` on note (configurable) |
| Edit own comment | Comment author OR `WRITE` on note |
| Delete own comment | Comment author OR `WRITE` on note |
| Delete others' comments | `WRITE` on note |
| Resolve/unresolve thread | `WRITE` on note |

### Service Implementation Pattern

```typescript
// backend/src/comments/comments.service.ts
@Injectable()
export class CommentsService {
  constructor(
    @InjectConnection() private readonly knex: Knex,
    private readonly logger: ConsoleLoggerService,
    private eventEmitter: EventEmitter2<NoteEventMap>,
  ) {
    this.logger.setContext(CommentsService.name)
  }

  async createThread(
    noteId: number,
    authorId: number | null,
    guestInfo: { name: string; session: string } | null,
    anchorText: string,
    anchorStart: number | null,
    anchorEnd: number | null,
    initialComment: string
  ): Promise<CommentThreadWithComments> {
    return await this.knex.transaction(async (trx) => {
      // 1. Create thread
      const [thread] = await trx(TableCommentThread)
        .insert({
          [FieldNameCommentThread.noteId]: noteId,
          [FieldNameCommentThread.anchorText]: anchorText,
          [FieldNameCommentThread.anchorStart]: anchorStart,
          [FieldNameCommentThread.anchorEnd]: anchorEnd,
        })
        .returning('*')

      // 2. Create initial comment
      const [comment] = await trx(TableComment)
        .insert({
          [FieldNameComment.threadId]: thread.id,
          [FieldNameComment.authorId]: authorId,
          [FieldNameComment.guestName]: guestInfo?.name ?? null,
          [FieldNameComment.guestSession]: guestInfo?.session ?? null,
          [FieldNameComment.content]: initialComment,
        })
        .returning('*')

      // 3. Emit event for real-time broadcast
      this.eventEmitter.emit(NoteEvent.COMMENT_THREAD_CREATED, {
        noteId,
        threadId: thread.id,
      })

      return { ...thread, comments: [comment] }
    })
  }

  async addReply(
    threadId: number,
    authorId: number | null,
    guestInfo: { name: string; session: string } | null,
    content: string
  ): Promise<Comment> {
    const [comment] = await this.knex(TableComment)
      .insert({
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: authorId,
        [FieldNameComment.guestName]: guestInfo?.name ?? null,
        [FieldNameComment.guestSession]: guestInfo?.session ?? null,
        [FieldNameComment.content]: content,
      })
      .returning('*')

    // Get noteId for event
    const thread = await this.knex(TableCommentThread)
      .where({ id: threadId })
      .first()

    this.eventEmitter.emit(NoteEvent.COMMENT_ADDED, {
      noteId: thread.note_id,
      threadId,
      commentId: comment.id,
    })

    return comment
  }
}
```

### Events

```typescript
// backend/src/events.ts - Add to NoteEvent enum
export enum NoteEvent {
  // ... existing events
  COMMENT_THREAD_CREATED = 'note.comment_thread_created',
  COMMENT_ADDED = 'note.comment_added',
  COMMENT_UPDATED = 'note.comment_updated',
  COMMENT_DELETED = 'note.comment_deleted',
  COMMENT_THREAD_RESOLVED = 'note.comment_thread_resolved',
}
```

### Real-time Broadcasting

```typescript
// backend/src/realtime/realtime-note/realtime-note.ts - Add method
public broadcastCommentUpdate(
  type: 'thread_created' | 'comment_added' | 'comment_updated' | 'comment_deleted' | 'thread_resolved',
  payload: unknown
): void {
  const message: Message<MessageType.COMMENT_UPDATE> = {
    type: MessageType.COMMENT_UPDATE,
    payload: { updateType: type, data: payload }
  }

  for (const client of this.clients) {
    client.getTransporter().send(message)
  }
}
```

---

## Frontend Implementation

### File Structure

```
frontend/src/
├── redux/comments/
│   ├── slice.ts
│   ├── types.ts
│   └── selectors.ts
├── api/comments/
│   └── index.ts
├── components/comments/
│   ├── comment-sidebar.tsx           # Main sidebar container
│   ├── comment-thread.tsx            # Single thread with replies
│   ├── comment-item.tsx              # Individual comment
│   ├── comment-form.tsx              # New comment/reply form
│   ├── comment-highlight.tsx         # Text highlighting in editor
│   └── guest-name-prompt.tsx         # Modal for guest name entry
└── components/editor-page/
    └── editor-pane/
        └── codemirror-extensions/
            └── comment-highlights/   # CodeMirror extension for highlights
                ├── index.ts
                └── comment-highlight-plugin.ts
```

### Redux State

```typescript
// frontend/src/redux/comments/types.ts
export interface CommentThread {
  id: number
  noteId: number
  anchorText: string
  anchorStart: number | null
  anchorEnd: number | null
  resolved: boolean
  resolvedBy: number | null
  resolvedAt: string | null
  comments: Comment[]
  createdAt: string
}

export interface Comment {
  id: number
  threadId: number
  authorId: number | null
  authorName: string           // Resolved from user or guestName
  authorDisplayName: string
  content: string
  isOwn: boolean               // Can current user edit this?
  createdAt: string
  updatedAt: string
}

export interface CommentsState {
  threads: CommentThread[]
  activeThreadId: number | null  // Currently selected/focused thread
  isLoading: boolean
  error: string | null
  guestSession: string | null    // UUID for guest comment ownership
  guestName: string | null       // Stored guest name
}

// frontend/src/redux/comments/slice.ts
const commentsSlice = createSlice({
  name: 'comments',
  initialState: {
    threads: [],
    activeThreadId: null,
    isLoading: false,
    error: null,
    guestSession: null,
    guestName: null,
  } as CommentsState,
  reducers: {
    setThreads(state, action: PayloadAction<CommentThread[]>) {
      state.threads = action.payload
    },
    addThread(state, action: PayloadAction<CommentThread>) {
      state.threads.push(action.payload)
    },
    addCommentToThread(state, action: PayloadAction<{ threadId: number; comment: Comment }>) {
      const thread = state.threads.find(t => t.id === action.payload.threadId)
      if (thread) {
        thread.comments.push(action.payload.comment)
      }
    },
    setActiveThread(state, action: PayloadAction<number | null>) {
      state.activeThreadId = action.payload
    },
    resolveThread(state, action: PayloadAction<{ threadId: number; resolvedBy: number }>) {
      const thread = state.threads.find(t => t.id === action.payload.threadId)
      if (thread) {
        thread.resolved = true
        thread.resolvedBy = action.payload.resolvedBy
        thread.resolvedAt = new Date().toISOString()
      }
    },
    setGuestInfo(state, action: PayloadAction<{ name: string; session: string }>) {
      state.guestName = action.payload.name
      state.guestSession = action.payload.session
    },
  },
})
```

### CodeMirror Extension for Highlights

```typescript
// frontend/src/components/editor-page/editor-pane/codemirror-extensions/comment-highlights/index.ts
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'

// Effect to update comment ranges
export const setCommentRanges = StateEffect.define<Array<{ from: number; to: number; threadId: number }>>()

// Decoration mark for highlighted text
const commentMark = Decoration.mark({ class: 'cm-comment-highlight' })
const activeCommentMark = Decoration.mark({ class: 'cm-comment-highlight cm-comment-highlight-active' })

// State field to track comment decorations
export const commentHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)

    for (const effect of tr.effects) {
      if (effect.is(setCommentRanges)) {
        const newDecorations = effect.value.map(range =>
          commentMark.range(range.from, range.to)
        )
        decorations = Decoration.set(newDecorations, true)
      }
    }

    return decorations
  },
  provide: field => EditorView.decorations.from(field),
})

// CSS styles
export const commentHighlightTheme = EditorView.baseTheme({
  '.cm-comment-highlight': {
    backgroundColor: 'rgba(255, 212, 0, 0.3)',
    borderBottom: '2px solid #ffd400',
    cursor: 'pointer',
  },
  '.cm-comment-highlight-active': {
    backgroundColor: 'rgba(255, 212, 0, 0.5)',
  },
})
```

### Comment Sidebar Component

```tsx
// frontend/src/components/comments/comment-sidebar.tsx
export const CommentSidebar: React.FC = () => {
  const threads = useApplicationState(state => state.comments.threads)
  const activeThreadId = useApplicationState(state => state.comments.activeThreadId)
  const dispatch = useAppDispatch()

  const unresolvedThreads = useMemo(
    () => threads.filter(t => !t.resolved),
    [threads]
  )
  const resolvedThreads = useMemo(
    () => threads.filter(t => t.resolved),
    [threads]
  )

  return (
    <div className="comment-sidebar">
      <div className="comment-sidebar-header">
        <h3>Comments ({unresolvedThreads.length})</h3>
      </div>

      <div className="comment-threads">
        {unresolvedThreads.map(thread => (
          <CommentThread
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
            onSelect={() => dispatch(setActiveThread(thread.id))}
          />
        ))}
      </div>

      {resolvedThreads.length > 0 && (
        <details className="resolved-threads">
          <summary>Resolved ({resolvedThreads.length})</summary>
          {resolvedThreads.map(thread => (
            <CommentThread
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onSelect={() => dispatch(setActiveThread(thread.id))}
            />
          ))}
        </details>
      )}
    </div>
  )
}
```

### Guest Name Handling

```tsx
// frontend/src/components/comments/guest-name-prompt.tsx
export const GuestNamePrompt: React.FC<{
  onSubmit: (name: string) => void
  onCancel: () => void
}> = ({ onSubmit, onCancel }) => {
  const [name, setName] = useState('')
  const existingName = useApplicationState(state => state.comments.guestName)

  useEffect(() => {
    if (existingName) {
      setName(existingName)
    }
  }, [existingName])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim())
    }
  }

  return (
    <Modal show onHide={onCancel}>
      <Modal.Header closeButton>
        <Modal.Title>Enter your name</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group>
            <Form.Label>Display name for your comments</Form.Label>
            <Form.Control
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Guest"
              maxLength={100}
              autoFocus
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(name.trim() || 'Guest')}>
          Continue
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
```

---

## Anchor Stability Strategy

The biggest challenge: **when document text changes, comment anchors can become invalid.**

### Approach: Multi-layer Anchoring

1. **Primary**: Character offsets (`anchor_start`, `anchor_end`)
2. **Fallback**: Stored anchor text (`anchor_text`) for fuzzy matching
3. **Recovery**: If exact match fails, use fuzzy string matching to relocate

```typescript
// frontend/src/components/comments/hooks/use-anchor-sync.ts
export function useAnchorSync(threads: CommentThread[], documentContent: string) {
  return useMemo(() => {
    return threads.map(thread => {
      // Try exact offset match first
      if (thread.anchorStart !== null && thread.anchorEnd !== null) {
        const textAtOffset = documentContent.slice(thread.anchorStart, thread.anchorEnd)
        if (textAtOffset === thread.anchorText) {
          return { ...thread, currentStart: thread.anchorStart, currentEnd: thread.anchorEnd }
        }
      }

      // Fallback: search for anchor text in document
      const index = documentContent.indexOf(thread.anchorText)
      if (index !== -1) {
        return {
          ...thread,
          currentStart: index,
          currentEnd: index + thread.anchorText.length,
          relocated: true,
        }
      }

      // Text not found - mark as orphaned
      return { ...thread, currentStart: null, currentEnd: null, orphaned: true }
    })
  }, [threads, documentContent])
}
```

### Real-time Anchor Updates

When a user with an open comment sidebar sees document changes:

1. Receive Yjs document update
2. Recalculate anchor positions for all threads
3. Update CodeMirror decorations
4. Optionally: Send anchor position updates to server periodically

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Database migration for `comment_thread` and `comment` tables
- [ ] Database types in `@hedgedoc/database` package
- [ ] Backend `CommentsService` with CRUD operations
- [ ] Backend `CommentsController` with REST endpoints
- [ ] DTOs and Zod schemas in `@hedgedoc/commons`
- [ ] Basic permission checks (READ to comment)

### Phase 2: Frontend Basics
- [ ] Redux slice for comments state
- [ ] API client functions
- [ ] Comment sidebar component (list view)
- [ ] Comment thread component with replies
- [ ] Comment form for new comments/replies
- [ ] Guest name prompt modal

### Phase 3: Editor Integration
- [ ] CodeMirror extension for text highlighting
- [ ] Text selection → "Add comment" button/shortcut
- [ ] Click highlight → focus thread in sidebar
- [ ] Anchor sync/relocation logic

### Phase 4: Real-time Sync
- [ ] WebSocket message types for comment events
- [ ] Backend event emission on comment changes
- [ ] Frontend WebSocket handler for comment updates
- [ ] Real-time thread/comment additions

### Phase 5: Polish
- [ ] Thread resolution (mark resolved/unresolve)
- [ ] Edit/delete comments
- [ ] Orphaned comment handling (anchor text not found)
- [ ] Comment count badge in UI
- [ ] Keyboard shortcuts
- [ ] Mobile-responsive sidebar

---

## Open Questions

1. **Should comments require any permission, or just viewing the note?**
   - HackMD allows anyone with read access to comment
   - Could be configurable per-note or instance-wide

2. **How to handle exports?**
   - Option A: Ignore comments in markdown export
   - Option B: Append comments as footnotes
   - Option C: Separate JSON sidecar file

3. **Should comments sync via Yjs or REST+WebSocket?**
   - Yjs: More complex, but leverages existing infrastructure
   - REST+WS: Simpler, comments are separate from document

4. **Thread resolution workflow?**
   - Who can resolve? Author of first comment? Anyone with write access?
   - Can resolved threads be re-opened?

---

## Related Issues

- [hedgedoc/hedgedoc#657](https://github.com/hedgedoc/hedgedoc/issues/657) - Main comments feature request
- [hedgedoc/hedgedoc#5450](https://github.com/hedgedoc/hedgedoc/issues/5450) - Floating comment threads
- [hedgedoc/hedgedoc#4351](https://github.com/hedgedoc/hedgedoc/issues/4351) - HackMD-style comments
- [hedgedoc/hedgedoc#2879](https://github.com/hedgedoc/hedgedoc/issues/2879) - CriticMarkup (rejected approach)
