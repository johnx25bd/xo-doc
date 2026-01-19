/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * A comment thread represents a discussion attached to a specific text range in a {@link Note}.
 *
 * Comment threads anchor to highlighted text using character offsets. When the document changes,
 * the anchor_text field can be used to relocate the thread if offsets become invalid.
 *
 * Thread resolution follows the Google Docs model:
 * - Thread authors can resolve their own threads (must be logged in)
 * - Users with WRITE permission can resolve any thread
 * - Guests cannot resolve threads
 */
export interface CommentThread {
  /** The unique id of the comment thread for internal referencing */
  [FieldNameCommentThread.id]: number

  /** The id of the {@link Note} this thread is attached to */
  [FieldNameCommentThread.noteId]: number

  /** The highlighted text this thread is anchored to (used for display and recovery) */
  [FieldNameCommentThread.anchorText]: string

  /** Character offset where the anchor starts (nullable for note-level comments) */
  [FieldNameCommentThread.anchorStart]: number | null

  /** Character offset where the anchor ends */
  [FieldNameCommentThread.anchorEnd]: number | null

  /** Whether this thread has been resolved */
  [FieldNameCommentThread.resolved]: boolean

  /** The id of the {@link User} who resolved this thread, if resolved */
  [FieldNameCommentThread.resolvedBy]: number | null

  /** Timestamp when this thread was resolved */
  [FieldNameCommentThread.resolvedAt]: string | null

  /** Timestamp when this thread was created */
  [FieldNameCommentThread.createdAt]: string

  /** Timestamp when this thread was last updated */
  [FieldNameCommentThread.updatedAt]: string
}

export const enum FieldNameCommentThread {
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

/** Type for inserting a new comment thread (id is auto-generated) */
export type TypeInsertCommentThread = Omit<CommentThread, FieldNameCommentThread.id>

/** Type for updating a comment thread (only resolution-related fields can be updated) */
export type TypeUpdateCommentThread = Pick<
  CommentThread,
  | FieldNameCommentThread.resolved
  | FieldNameCommentThread.resolvedBy
  | FieldNameCommentThread.resolvedAt
  | FieldNameCommentThread.updatedAt
>
