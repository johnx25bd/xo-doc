/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'

/**
 * Schema for resolving or unresolving a comment thread.
 *
 * Resolution follows the Google Docs model:
 * - Thread authors (first comment author) can resolve their own threads
 * - Users with WRITE permission on the note can resolve any thread
 * - Guests cannot resolve threads (must be logged in)
 */
export const ResolveThreadSchema = z
  .object({
    resolved: z.boolean().describe('Whether to resolve (true) or unresolve (false) the thread'),
  })
  .describe('DTO for resolving or unresolving a comment thread')

export type ResolveThreadInterface = z.infer<typeof ResolveThreadSchema>
