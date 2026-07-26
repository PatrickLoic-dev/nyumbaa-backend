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

const ALLOWED_MIME_TYPES: AllowedMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
}
