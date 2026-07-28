import {
  Injectable,
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { randomUUID } from 'crypto';

export type AllowedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedVideoMimeType = 'video/mp4' | 'video/quicktime' | 'video/webm';

const ALLOWED_MIME_TYPES: AllowedMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME_TYPES: AllowedVideoMimeType[] = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;       // 10 MB (images)
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB (videos)

export interface PresignedUploadResult {
  uploadUrl: string;
  s3Key: string;
  cdnUrl: string;
}

@Injectable()
export class UploadService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async createPostImageUploadUrl(
    filename: string,
    contentType: string,
    fileSizeBytes?: number,
  ): Promise<PresignedUploadResult> {
    if (!ALLOWED_MIME_TYPES.includes(contentType as AllowedMimeType)) {
      throw new UnsupportedMediaTypeException({
        error: 'UNSUPPORTED_FORMAT',
        accepted: ['jpg', 'png', 'webp'],
      });
    }

    if (fileSizeBytes !== undefined && fileSizeBytes > MAX_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        error: 'IMAGE_TOO_LARGE',
        maxMb: 10,
      });
    }

    const bucket = this.config.get<string>('storage.bucket')!;
    const ext = this.mimeToExt(contentType as AllowedMimeType);
    const s3Key = `posts/${randomUUID()}/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;

    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUploadUrl(s3Key);

    if (error || !data) {
      throw new BadRequestException('Failed to generate upload URL');
    }

    const supabaseUrl = this.config.get<string>('supabase.url')!;
    const cdnUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${s3Key}`;

    return { uploadUrl: data.signedUrl, s3Key, cdnUrl };
  }

  async createPostVideoUploadUrl(
    filename: string,
    contentType: string,
    fileSizeBytes?: number,
  ): Promise<PresignedUploadResult> {
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(contentType as AllowedVideoMimeType)) {
      throw new UnsupportedMediaTypeException({
        error: 'UNSUPPORTED_FORMAT',
        accepted: ['mp4', 'mov', 'webm'],
      });
    }

    if (fileSizeBytes !== undefined && fileSizeBytes > MAX_VIDEO_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        error: 'VIDEO_TOO_LARGE',
        maxMb: 200,
      });
    }

    const bucket = this.config.get<string>('storage.bucket')!;
    const ext = this.videoMimeToExt(contentType as AllowedVideoMimeType);
    const s3Key = `posts/videos/${randomUUID()}/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;

    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUploadUrl(s3Key);

    if (error || !data) {
      throw new BadRequestException('Failed to generate video upload URL');
    }

    const supabaseUrl = this.config.get<string>('supabase.url')!;
    const cdnUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${s3Key}`;

    return { uploadUrl: data.signedUrl, s3Key, cdnUrl };
  }

  async createAvatarUploadUrl(userId: string, contentType: string): Promise<PresignedUploadResult> {
    if (!ALLOWED_MIME_TYPES.includes(contentType as AllowedMimeType)) {
      throw new UnsupportedMediaTypeException({
        error: 'UNSUPPORTED_FORMAT',
        accepted: ['jpg', 'png', 'webp'],
      });
    }

    const bucket = this.config.get<string>('storage.bucket')!;
    const ext = this.mimeToExt(contentType as AllowedMimeType);
    const s3Key = `avatars/${userId}/avatar.${ext}`;

    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUploadUrl(s3Key, { upsert: true });

    if (error || !data) {
      throw new BadRequestException(`Failed to generate avatar upload URL: ${error?.message ?? 'no data'} (bucket: ${bucket})`);
    }

    const supabaseUrl = this.config.get<string>('supabase.url')!;
    const cdnUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${s3Key}`;

    return { uploadUrl: data.signedUrl, s3Key, cdnUrl };
  }

  async deleteObject(s3Key: string): Promise<void> {
    const bucket = this.config.get<string>('storage.bucket')!;
    await this.supabase.admin.storage.from(bucket).remove([s3Key]);
  }

  private mimeToExt(mime: AllowedMimeType): string {
    const map: Record<AllowedMimeType, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return map[mime];
  }

  private videoMimeToExt(mime: AllowedVideoMimeType): string {
    const map: Record<AllowedVideoMimeType, string> = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
    };
    return map[mime];
  }
}
