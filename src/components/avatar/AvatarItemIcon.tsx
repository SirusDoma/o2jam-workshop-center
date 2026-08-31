import { Cat, CircleFadingArrowUp, CopyPlus, Crown, Drum, FaceGrinning, Gavel, Gem, Glasses, Guitar, Hand, IdCard, KeyboardMusic, Music, Shirt, Speaker, SportShoe, UserRound } from 'lucide-react';
import type { ItemEntry } from '../../o2jam';

export function AvatarItemIcon({ item }: { item: ItemEntry }) {
  const label = `${item.itemPartLabel} ${item.itemTypeLabel}`.toLowerCase();
  if (/attributive/.test(label)) return <CircleFadingArrowUp size={15} />;
  if (/name changer/.test(label)) return <IdCard size={15} />;
  if (/penalty/.test(label)) return <Gavel size={15} />;
  if (/bag expansion/.test(label)) return <CopyPlus size={15} />;
  if (/pet/.test(label)) return <Cat size={15} />;
  if (/musical accessor/.test(label)) return <Speaker size={15} />;
  if (/drum/.test(label)) return <Drum size={15} />;
  if (/guitar/.test(label)) return <Guitar size={15} />;
  if (/key/.test(label)) return <KeyboardMusic size={15} />;
  if (/bass|instrument/.test(label)) return <Music size={15} />;
  if (/shoe|foot/.test(label)) return <SportShoe size={15} />;
  if (/glove|hand/.test(label)) return <Hand size={15} />;
  if (/accessor|earring|necklace|amulet/.test(label)) return <Gem size={15} />;
  if (/glass|eye/.test(label)) return <Glasses size={15} />;
  if (/face/.test(label)) return <FaceGrinning size={15} />;
  if (/hair|hat|head|cap/.test(label)) return <Crown size={15} />;
  if (/arm\b|body|skin/.test(label)) return <UserRound size={15} />;
  return <Shirt size={15} />;
}
