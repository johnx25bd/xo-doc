/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CreateCommentThreadSchema } from '@hedgedoc/commons';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO for creating a new comment thread with an initial comment.
 */
export class CreateCommentThreadDto extends createZodDto(CreateCommentThreadSchema) {}
