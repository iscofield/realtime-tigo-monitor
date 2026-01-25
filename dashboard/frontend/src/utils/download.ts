/**
 * Download utility for triggering file downloads from Blobs.
 */

/**
 * Trigger a browser download for a Blob with the specified filename.
 *
 * @param blob - The Blob to download
 * @param filename - The suggested filename for the download
 */
export function downloadBlob(blob: Blob, filename: string): void {
  // Create a temporary URL for the blob
  const url = URL.createObjectURL(blob);

  // Create a temporary anchor element to trigger the download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
