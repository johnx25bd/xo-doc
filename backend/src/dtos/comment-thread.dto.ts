/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CommentThreadSchema, CommentThreadSummarySchema } from '@hedgedoc/commons';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO representing a comment thread with all its comments.
 */
export class CommentThreadDto extends createZodDto(CommentThreadSchema) {}

/**
 * DTO representing a comment thread summary (without full comments).
 */
export class CommentThreadSummaryDto extends createZodDto(CommentThreadSummarySchema) {}
