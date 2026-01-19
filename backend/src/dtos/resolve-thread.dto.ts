/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ResolveThreadSchema } from '@hedgedoc/commons';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO for resolving or unresolving a comment thread.
 */
export class ResolveThreadDto extends createZodDto(ResolveThreadSchema) {}
