import { env } from '$env/dynamic/private';
import { PUBLIC_R2_BUCKET_NAME } from '$env/static/public';

import type { PreparedUpload, UploadFile, UploadPolicyId } from '$lib/upload/policies';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { createUploadKey, getUploadPolicy, getUploadUrl } from '$lib/upload/policies';

import { config } from '$config/server';

export async function prepareUpload(policyId: UploadPolicyId, file: UploadFile): Promise<PreparedUpload> {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !PUBLIC_R2_BUCKET_NAME) {
    throw new Error('File storage is not configured');
  }

  const s3 = new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    },
    region: 'auto'
  });
  const policy = getUploadPolicy(policyId);
  const key = createUploadKey(policy, crypto.randomUUID());
  const command = new PutObjectCommand({
    Bucket: PUBLIC_R2_BUCKET_NAME,
    ContentLength: file.size,
    ContentType: file.type,
    Key: key
  });

  return {
    file: {
      key,
      url: getUploadUrl(key)
    },
    uploadUrl: await getSignedUrl(s3, command, { expiresIn: config.upload.signing.expiresIn })
  };
}
