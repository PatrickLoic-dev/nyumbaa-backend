import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition';

const NSFW_CONFIDENCE_THRESHOLD = 70; // percent

@Injectable()
export class RekognitionService {
  private readonly logger = new Logger(RekognitionService.name);
  private readonly client: RekognitionClient | null;

  constructor(private readonly config: ConfigService) {
    const accessKeyId = config.get<string>('aws.accessKeyId');
    const secretAccessKey = config.get<string>('aws.secretAccessKey');

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS credentials not set — Rekognition moderation disabled');
      this.client = null;
      return;
    }

    this.client = new RekognitionClient({
      region: config.get<string>('aws.region') ?? 'eu-west-1',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  /**
   * Returns true if the image contains NSFW / violent content above the threshold.
   * Returns false when AWS credentials are absent (dev environment fallback).
   */
  async isNsfw(s3Bucket: string, s3Key: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const command = new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: s3Bucket, Name: s3Key } },
        MinConfidence: NSFW_CONFIDENCE_THRESHOLD,
      });

      const response = await this.client.send(command);
      const labels = response.ModerationLabels ?? [];

      if (labels.length > 0) {
        this.logger.warn(
          `NSFW labels detected on ${s3Key}: ${labels.map((l) => l.Name).join(', ')}`,
        );
      }

      return labels.length > 0;
    } catch (err) {
      this.logger.error(`Rekognition error for ${s3Key}: ${(err as Error).message}`);
      return false;
    }
  }
}
