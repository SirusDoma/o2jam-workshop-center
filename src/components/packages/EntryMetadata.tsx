import type { ArchiveEntry, Sprite } from '../../o2jam';
import { fmtBytes, fmtHex, fmtOffset } from '../../format';

function MetadataRow({ label, value, at, unknown }: { label: string; value: string; at?: number; unknown?: boolean }) {
  return (
    <div className="metarow">
      <span className={`mr-k${unknown ? ' unknown' : ''}`}>{label}</span>
      <span className="mr-v">
        {value}
        {at !== undefined && <span className="mr-at">+{at}</span>}
      </span>
    </div>
  );
}

function SpriteMetadata({ sprite }: { sprite: Sprite }) {
  return (
    <>
      <MetadataRow label="Sprite format" value={sprite.formatLabel} />
      <MetadataRow label="Frames" value={String(sprite.frameCount)} />
      <MetadataRow label="Colour key" value={`0x${fmtHex(sprite.colorKey, 4)}`} />
    </>
  );
}

export function EntryMetadata({
  entry,
  name,
  size,
  type,
  sprite,
}: {
  entry: ArchiveEntry | null;
  name: string;
  size: number;
  type: string;
  sprite: Sprite | null;
}) {
  if (!entry) {
    return (
      <>
        <MetadataRow label="Name" value={name} />
        <MetadataRow label="File size" value={`${fmtBytes(size)} · ${size}`} />
        <MetadataRow label="Type" value={type} />
        {sprite && <SpriteMetadata sprite={sprite} />}
      </>
    );
  }

  return (
    <>
      <MetadataRow label="Index" value={String(entry.index)} />
      <MetadataRow label="Signature" value={String(entry.signature)} at={0} />
      <MetadataRow label="Data offset" value={fmtOffset(entry.offset)} at={132} />
      <MetadataRow label="File size" value={`${fmtBytes(entry.size)} · ${entry.size}`} at={136} />
      <MetadataRow label="Reserved size" value={`${fmtBytes(entry.reservedSize)} · ${entry.reservedSize}`} at={140} />
      <MetadataRow label="Unknown" value={`${entry.unknown1} · 0x${fmtHex(entry.unknown1 >>> 0, 8)}`} at={144} unknown />
      <MetadataRow label="Unknown" value={`${entry.unknown2} · 0x${fmtHex(entry.unknown2 >>> 0, 8)}`} at={148} unknown />
      {sprite && <SpriteMetadata sprite={sprite} />}
    </>
  );
}
