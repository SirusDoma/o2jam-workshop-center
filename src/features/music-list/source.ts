import { parseArchive, readEntry } from '../../o2jam';

export interface MusicListSource {
  buffer: ArrayBuffer;
  filename: string;
  source: string;
}

export async function readMusicListSource(files: readonly File[]): Promise<MusicListSource | null> {
  const dat = files.find((file) => file.name.toLowerCase().endsWith('.dat'));
  if (dat) {
    return { buffer: await dat.arrayBuffer(), filename: dat.name, source: dat.name };
  }

  for (const file of files.filter((candidate) => candidate.name.toLowerCase().endsWith('.opi'))) {
    try {
      const buffer = await file.arrayBuffer();
      const archive = parseArchive(buffer, 'ascii');
      const entry = archive.entries.find((candidate) => candidate.name.toLowerCase() === 'ojnlist.dat');
      if (entry) {
        const data = readEntry(buffer, entry);
        return { buffer: data.slice().buffer as ArrayBuffer, filename: entry.name, source: `${file.name} / ${entry.name}` };
      }
    } catch {
    }
  }

  return null;
}
