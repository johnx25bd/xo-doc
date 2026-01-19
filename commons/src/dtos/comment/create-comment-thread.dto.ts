/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'

/**
 * Schema for creating a new comment thread.
 *
 * A thread is always created with an initial comment. The anchor fields
 * specify where in the document the thread is attached. For note-level
 * comments (not attached to specific text), anchorStart and anchorEnd
 * should be null.
 *
 * For guest users, guestName is required and will be used as the display
 * name for the initial comment.
 */
export const CreateCommentThreadSchema = z
  .object({
    anchorText: z
      .string()
      .min(1)
      .describe('The text that was highlighted/selected for this comment'),
    anchorStart: z
      .number()
      .int()
      .min(0)
      .nullable()
      .describe('Character offset where the highlight starts. Null for note-level comments.'),
    anchorEnd: z
      .number()
      .int()
      .min(0)
      .nullable()
      .describe('Character offset where the highlight ends. Null for note-level comments.'),
    initialComment: z
      .string()
      .min(1)
      .max(10000)
      .describe('The markdown content of the first comment in the thread'),
    guestName: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Display name for guest users. Required if not logged in.'),
  })
  .describe('DTO for creating a new comment thread with an initial comment')

export type CreateCommentThreadInterface = z.infer<typeof CreateCommentThreadSchema>
