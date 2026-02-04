import robotDefault from '../assets/sprites/robot.png';
import robotGreen from '../assets/sprites/skins/robot_3Dgreen.png';
import robotRed from '../assets/sprites/skins/robot_3Dred.png';
import robotYellow from '../assets/sprites/skins/robot_3Dyellow.png';

export interface Skin {
  id: string;
  name: string;
  cost: number; // 0 = free (default skin)
  image: string; // Imported image asset
}

export const SKINS: Skin[] = [
  { id: 'default', name: 'Classic', cost: 0, image: robotDefault },
  { id: 'green', name: '3D Green', cost: 25, image: robotGreen },
  { id: 'red', name: '3D Red', cost: 50, image: robotRed },
  { id: 'yellow', name: '3D Golden', cost: 75, image: robotYellow },
];

export const DEFAULT_SKIN_ID = 'default';

/**
 * Get the skin image URL by skin ID.
 * Falls back to default skin if the ID is not found.
 */
export function getSkinImageById(skinId: string | undefined): string {
  const skin = SKINS.find(s => s.id === skinId);
  return skin?.image || SKINS[0].image; // Fallback to default
}
