/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'
import { CommentSchema } from './comment.dto.js'

/**
 * Schema for a comment thread attached to a note.
 *
 * Threads anchor to specific text ranges using character offsets.
 * The anchorText field stores the highlighted text for display and
 * fallback relocation when document changes invalidate offsets.
 *
 * Resolution follows the Google Docs model:
 * - Thread authors can resolve their own threads
 * - Users with WRITE permission can resolve any thread
 * - Guests cannot resolve threads
 */
export const CommentThreadSchema = z
  .object({
    id: z.number().describe('The unique ID of the comment thread'),
    noteId: z.number().describe('The ID of the note this thread is attached to'),
    anchorText: z
      .string()
      .describe('The text that was highlighted for this comment thread'),
    anchorStart: z
      .number()
      .nullable()
      .describe('Character offset where the highlight starts. Null for note-level comments.'),
    anchorEnd: z
      .number()
      .nullable()
      .describe('Character offset where the highlight ends. Null for note-level comments.'),
    resolved: z.boolean().describe('Whether the comment thread has been resolved'),
    resolvedByUsername: z
      .string()
      .nullable()
      .describe('Username of who resolved the thread. Null if not resolved.'),
    resolvedAt: z
      .string()
      .datetime({ offset: false, local: false })
      .nullable()
      .describe('When the thread was resolved. Null if not resolved.'),
    comments: z.array(CommentSchema).describe('The comments within this thread'),
    createdAt: z
      .string()
      .datetime({ offset: false, local: false })
      .describe('When the thread was created'),
    updatedAt: z
      .string()
      .datetime({ offset: false, local: false })
      .describe('When the thread was last updated'),
  })
  .describe('A thread of comments anchored to text in a note')

export type CommentThreadInterface = z.infer<typeof CommentThreadSchema>

/**
 * Lightweight thread representation without comments.
 * Used for list views where full comment data isn't needed.
 */
export const CommentThreadSummarySchema = z
  .object({
    id: z.number().describe('The unique ID of the comment thread'),
    noteId: z.number().describe('The ID of the note this thread is attached to'),
    anchorText: z.string().describe('The text that was highlighted'),
    anchorStart: z.number().nullable().describe('Character offset where the highlight starts'),
    anchorEnd: z.number().nullable().describe('Character offset where the highlight ends'),
    resolved: z.boolean().describe('Whether the thread is resolved'),
    commentCount: z.number().describe('Number of comments in the thread'),
    createdAt: z.string().datetime({ offset: false, local: false }).describe('When created'),
  })
  .describe('Summary of a comment thread without full comment data')

export type CommentThreadSummaryInterface = z.infer<typeof CommentThreadSummarySchema>
