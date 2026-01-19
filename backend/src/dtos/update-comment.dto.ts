/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { UpdateCommentSchema } from '@hedgedoc/commons';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO for updating an existing comment.
 */
export class UpdateCommentDto extends createZodDto(UpdateCommentSchema) {}
