import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { POST_FANOUT_QUEUE } from '../posts.constants';

export interface FanoutJobData {
  postId: string;
  authorId: string;
  visibility: string;
}

@Processor(POST_FANOUT_QUEUE)
export class FanoutProcessor extends WorkerHost {
  private readonly logger = new Logger(FanoutProcessor.name);

  async process(job: Job<FanoutJobData>): Promise<void> {
    const { postId, authorId, visibility } = job.data;
    this.logger.log(`Processing fanout for post ${postId} (author: ${authorId}, visibility: ${visibility})`);
    // Timeline distribution logic goes here in the feed module (Phase 2)
  }
}
