// backend/services/audioStorage.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Upload audio buffer and return publicly accessible URL
 * 
 * Options:
 * 1. Local file storage (simple, for development)
 * 2. AWS S3 (recommended for production)
 * 3. Google Cloud Storage
 * 4. Cloudinary
 */

// For now, we'll use local file storage served by Express
// In production, migrate to S3/GCS

const AUDIO_DIR = path.join(process.cwd(), 'backend', 'audio', 'public');

/**
 * Upload audio and return public URL
 */
export async function uploadAudio(
  audioBuffer: Buffer,
  identifier: string
): Promise<string> {
  try {
    // Ensure directory exists
    await fs.mkdir(AUDIO_DIR, { recursive: true });

    // Generate unique filename
    const hash = crypto.createHash('md5').update(identifier + Date.now()).digest('hex');
    const filename = `${hash}.mp3`;
    const filePath = path.join(AUDIO_DIR, filename);

    // Save file
    await fs.writeFile(filePath, audioBuffer);

    // Generate public URL
    const publicUrl = `${process.env.BACKEND_BASE_URL}/audio/${filename}`;

    console.log(`✅ Audio uploaded: ${publicUrl}`);
    
    // Clean up old files (keep only last 100)
    await cleanupOldAudioFiles();

    return publicUrl;
  } catch (error: any) {
    console.error('❌ Audio upload failed:', error.message);
    throw error;
  }
}

/**
 * Clean up old audio files to save disk space
 */
async function cleanupOldAudioFiles(): Promise<void> {
  try {
    const files = await fs.readdir(AUDIO_DIR);
    
    // Only clean up if more than 100 files
    if (files.length > 100) {
      // Get file stats
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(AUDIO_DIR, file);
          const stat = await fs.stat(filePath);
          return { file, mtime: stat.mtime.getTime() };
        })
      );

      // Sort by modification time (oldest first)
      fileStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest files (keep newest 50)
      const filesToDelete = fileStats.slice(0, fileStats.length - 50);
      
      await Promise.all(
        filesToDelete.map(({ file }) => 
          fs.unlink(path.join(AUDIO_DIR, file)).catch(() => {})
        )
      );

      console.log(`🧹 Cleaned up ${filesToDelete.length} old audio files`);
    }
  } catch (error: any) {
    console.error('⚠️ Cleanup failed:', error.message);
    // Don't throw - cleanup is not critical
  }
}

/**
 * AWS S3 Upload (for production)
 * Uncomment and configure when ready to use S3
 */
/*
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

export async function uploadAudioToS3(
  audioBuffer: Buffer,
  identifier: string
): Promise<string> {
  const hash = crypto.createHash('md5').update(identifier + Date.now()).digest('hex');
  const key = `tts-audio/${hash}.mp3`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET || 'deepak-fertilisers-audio',
    Key: key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
    ACL: 'public-read'
  });

  await s3Client.send(command);

  const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  console.log(`✅ Audio uploaded to S3: ${url}`);
  
  return url;
}
*/

/**
 * Validate storage configuration
 */
export function validateStorageConfig(): boolean {
  if (!process.env.BACKEND_BASE_URL) {
    console.error('❌ BACKEND_BASE_URL not configured for audio storage');
    return false;
  }
  return true;
}
