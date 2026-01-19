/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CreateCommentSchema } from '@hedgedoc/commons';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO for creating a new comment (reply) in an existing thread.
 */
export class CreateCommentDto extends createZodDto(CreateCommentSchema) {}
