import { FileArchive, FileText, Image } from 'lucide-react';
import { isSprite } from '../../features/packages/packageUtils';

export function PackageIcon({ ext }: { ext: string }) {
  if (isSprite(ext)) return <Image size={15} />;
  if (ext === 'txt') return <FileText size={15} />;
  return <FileArchive size={15} />;
}
