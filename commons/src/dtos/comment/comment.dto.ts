/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'

/**
 * Schema for a single comment within a thread.
 *
 * Comments can be authored by either registered users (authorId set) or
 * guests (guestName and guestSession set). The guestSession UUID allows
 * guests to edit/delete their own comments within the same browser session.
 */
export const CommentSchema = z
  .object({
    id: z.number().describe('The unique ID of the comment'),
    threadId: z.number().describe('The ID of the thread this comment belongs to'),
    authorUsername: z
      .string()
      .nullable()
      .describe('The username of the comment author. Null for guests.'),
    authorDisplayName: z
      .string()
      .describe('The display name of the comment author (user or guest name)'),
    isGuest: z.boolean().describe('Whether the comment was made by a guest'),
    content: z.string().describe('The markdown content of the comment'),
    createdAt: z
      .string()
      .datetime({ offset: false, local: false })
      .describe('When the comment was created'),
    updatedAt: z
      .string()
      .datetime({ offset: false, local: false })
      .describe('When the comment was last updated'),
  })
  .describe('A comment within a comment thread')

export type CommentInterface = z.infer<typeof CommentSchema>
