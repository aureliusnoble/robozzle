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
  { id: 'green', name: 'Classic Green', cost: 0, image: robotGreen },
  { id: 'red', name: 'Red Robot', cost: 25, image: robotRed },
  { id: 'yellow', name: 'Golden', cost: 50, image: robotYellow },
];

export const DEFAULT_SKIN_ID = 'green';
