/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service.js';

/**
 * Module providing comment thread and comment management functionality.
 *
 * This module handles:
 * - Creating, updating, and deleting comment threads
 * - Creating, updating, and deleting comments within threads
 * - Thread resolution workflow
 * - Real-time event emission for comment changes
 */
@Module({
  imports: [],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
