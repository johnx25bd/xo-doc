/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'

/**
 * Schema for creating a new comment (reply) within an existing thread.
 *
 * For guest users, guestName is required and will be used as the
 * display name for the comment.
 */
export const CreateCommentSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(10000)
      .describe('The markdown content of the comment'),
    guestName: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Display name for guest users. Required if not logged in.'),
  })
  .describe('DTO for creating a new comment (reply) in an existing thread')

export type CreateCommentInterface = z.infer<typeof CreateCommentSchema>
