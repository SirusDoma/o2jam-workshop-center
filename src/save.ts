export async function saveFile(data: Uint8Array | Blob | string, filename: string): Promise<boolean> {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer)], {
          type: 'application/octet-stream',
        });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
