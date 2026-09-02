import { randomUUID } from 'crypto'
import { supabaseAdmin } from './supabaseServer'
import { recordSystemError } from './system-errors'

export const LOGO_BUCKET = 'startup-logos'

export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])

export function extensionForContentType(contentType: string): string | null {
  return ALLOWED_CONTENT_TYPES[contentType.toLowerCase()] ?? null
}

export function normalizeExtension(ext: string): string | null {
  const lower = ext.toLowerCase()
  if (lower === 'jpeg') return 'jpg'
  if (ALLOWED_EXTENSIONS.has(lower)) return lower
  return null
}

export function generateLogoPath(startupId: string, contentType: string): { path: string; ext: string } | null {
  const ext = extensionForContentType(contentType)
  if (!ext) return null
  const name = randomUUID()
  return { path: `${startupId}/${name}.${ext}`, ext }
}

export function extractBucketPath(urlString: string, bucketName: string = LOGO_BUCKET): string | null {
  try {
    const url = new URL(urlString)
    const prefix = `/storage/v1/object/public/${bucketName}/`
    if (url.pathname.startsWith(prefix)) {
      return decodeURIComponent(url.pathname.slice(prefix.length))
    }
  } catch {
    // not a full URL
  }

  const bucketPrefix = `${bucketName}/`
  if (urlString.startsWith(bucketPrefix)) {
    return urlString.slice(bucketPrefix.length)
  }

  return null
}

export function isLogoInBucket(urlString: string, bucketName: string = LOGO_BUCKET): boolean {
  return extractBucketPath(urlString, bucketName) !== null
}

export function getFirstSegment(path: string): string {
  return path.split('/')[0] ?? ''
}

export function detectImageType(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }

  return null
}

export function validateLogoBytes(path: string, bytes: Uint8Array): { valid: boolean; reason?: string } {
  const rawExt = path.split('.').pop()
  const ext = rawExt ? normalizeExtension(rawExt) : null
  if (!ext) {
    return { valid: false, reason: 'Invalid logo file extension' }
  }

  const actual = detectImageType(bytes)
  if (!actual) {
    return { valid: false, reason: 'File does not match a recognized image format' }
  }

  if (ext === 'jpg' && actual !== 'jpg') {
    return { valid: false, reason: 'File extension does not match contents (expected JPEG)' }
  }
  if (ext === 'png' && actual !== 'png') {
    return { valid: false, reason: 'File extension does not match contents (expected PNG)' }
  }
  if (ext === 'webp' && actual !== 'webp') {
    return { valid: false, reason: 'File extension does not match contents (expected WebP)' }
  }

  return { valid: true }
}

export async function downloadLogoHead(
  path: string,
  maxBytes = 128
): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from(LOGO_BUCKET).download(path)
  if (error || !data) {
    return null
  }

  try {
    const buffer = await data.arrayBuffer()
    return new Uint8Array(buffer).slice(0, maxBytes)
  } catch {
    return null
  }
}

export async function validateStoredLogo(path: string): Promise<{ valid: boolean; reason?: string }> {
  const bytes = await downloadLogoHead(path)
  if (!bytes) {
    return { valid: false, reason: 'Could not retrieve uploaded file' }
  }
  return validateLogoBytes(path, bytes)
}

export async function deleteStoredLogo(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(LOGO_BUCKET).remove([path])
  if (error) {
    console.error('[logo-storage] deleteStoredLogo error:', error, 'path:', path)
    void recordSystemError({
      source: 'swallowed',
      name: 'DeleteStoredLogoFailed',
      message: error.message,
      path: 'lib/logo-storage.ts/deleteStoredLogo',
      context: { path, error: { message: error.message, name: error.name } },
    })
  }
}

export async function validateLogoUrl(
  logoUrl: string | null,
  startupId: string
): Promise<{ error?: string; logoUrl: string | null }> {
  if (!logoUrl || !isLogoInBucket(logoUrl)) {
    return { logoUrl }
  }

  const path = extractBucketPath(logoUrl)
  if (!path || getFirstSegment(path) !== startupId) {
    return { error: 'Logo path does not match this startup', logoUrl }
  }

  const { valid, reason } = await validateStoredLogo(path)
  if (!valid) {
    await deleteStoredLogo(path).catch(() => {})
    return { error: reason || 'Invalid logo file', logoUrl }
  }

  return { logoUrl }
}
