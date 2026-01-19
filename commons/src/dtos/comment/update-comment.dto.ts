/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'

/**
 * Schema for updating an existing comment.
 *
 * Only the comment content can be updated. Authors can edit their own
 * comments, and users with WRITE permission can edit any comment.
 * Guest users can edit their own comments if they have the same session.
 */
export const UpdateCommentSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(10000)
      .describe('The updated markdown content of the comment'),
  })
  .describe('DTO for updating an existing comment')

export type UpdateCommentInterface = z.infer<typeof UpdateCommentSchema>
