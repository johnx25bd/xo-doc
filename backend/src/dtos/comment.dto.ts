/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CommentSchema } from '@hedgedoc/commons';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO representing a single comment within a thread.
 */
export class CommentDto extends createZodDto(CommentSchema) {}
