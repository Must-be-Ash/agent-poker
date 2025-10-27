/**
 * Type declarations for pokersolver module
 * Since @types/pokersolver doesn't exist, we declare the module here
 */

declare module 'pokersolver' {
  export interface Card {
    value: string;
    suit: string;
    rank: number;
    wildValue?: string;
    toString(): string;
  }

  export interface Hand {
    name: string;
    descr: string;
    cards: Card[];
    rank: number;
    toString(): string;
    compare(hand: Hand): number;
  }

  export class Game {
    constructor(gameType: string);
    solve(cards: string[]): Hand;
  }

  export namespace Hand {
    function solve(cards: string[], gameType?: string): Hand;
    function winners(hands: Hand[]): Hand[];
  }
}
