import { RealOrNotGame, WhoSaidGame, WhichBookGame } from './trivia.js';
import { BluffGame } from './bluff.js';
import { TimelineGame } from './timeline.js';
import { DrawGame } from './draw.js';
import { LaughsGame } from './laughs.js';

// Menu order on the big screen.
const GAMES = [RealOrNotGame, BluffGame, WhoSaidGame, WhichBookGame, TimelineGame, DrawGame, LaughsGame];

export const gameById = new Map(GAMES.map((G) => [G.meta.id, G]));

export const gameMenu = GAMES.map((G) => G.meta);
