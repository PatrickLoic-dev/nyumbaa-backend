import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LIKES_NOTIFY_QUEUE } from '../likes.constants';

export interface LikesNotifyJobData {
  postId: string;
  postAuthorId: string;
  likesCount: number;
}

@Processor(LIKES_NOTIFY_QUEUE)
export class LikesNotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(LikesNotifyProcessor.name);

  async process(job: Job<LikesNotifyJobData>): Promise<void> {
    const { postId, postAuthorId, likesCount } = job.data;
    this.logger.log(
      `Sending consolidated like notification to author ${postAuthorId} for post ${postId} (${likesCount} likes)`,
    );
    // Expo push via NotificationsModule — Phase 2
  }
}
