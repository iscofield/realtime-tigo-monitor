/**
 * Backup and restore API functions.
 * Handles communication with backend backup endpoints.
 */

import type { RestoreData, RestoreImageCommitResponse } from '../types/config';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Export configuration as a downloadable ZIP backup.
 *
 * @returns Blob containing the ZIP file
 * @throws Error if export fails
 */
export async function exportBackup(): Promise<Blob> {
  const url = `${API_BASE}/api/backup/export`;
  const response = await fetch(url, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Export failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Upload and validate a backup file.
 *
 * @param file - The backup ZIP file to restore
 * @returns Parsed configuration data and optional image token
 * @throws Error if validation fails
 */
export async function restoreBackup(file: File): Promise<RestoreData> {
  const url = `${API_BASE}/api/backup/restore`;
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.detail;
    if (detail && typeof detail === 'object' && detail.message) {
      throw new Error(detail.message);
    }
    throw new Error(errorData.message || `Restore failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Commit a temporarily stored image to the final location.
 *
 * @param token - Token from restoreBackup response
 * @param overlaySize - Optional overlay size from backup to preserve
 * @returns Image metadata
 * @throws Error if commit fails
 */
export async function commitRestoreImage(
  token: string,
  overlaySize?: number
): Promise<RestoreImageCommitResponse> {
  const url = `${API_BASE}/api/backup/restore/image/${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ overlay_size: overlaySize ?? null }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.detail;
    if (detail && typeof detail === 'object' && detail.message) {
      throw new Error(detail.message);
    }
    throw new Error(errorData.message || `Image commit failed: ${response.status}`);
  }

  return response.json();
}
