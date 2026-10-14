// Deck.js - A standard 52-card deck

import { Card, SUITS, RANKS } from './Card.js';
import { shuffleArray } from './utils.js';

export class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    /**
     * Resets the deck to a full 52 cards and shuffles.
     */
    reset() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
        this.shuffle();
    }

    /**
     * Shuffles the deck.
     */
    shuffle() {
        shuffleArray(this.cards);
    }

    /**
     * Draws a card from the top of the deck.
     * @returns {Card | undefined}
     */
    draw() {
        return this.cards.pop();
    }

    /**
     * Draws multiple cards from the deck.
     * @param {number} count 
     * @returns {Card[]}
     */
    drawMultiple(count) {
        const drawn = [];
        for (let i = 0; i < count; i++) {
            const card = this.draw();
            if (card) drawn.push(card);
        }
        return drawn;
    }

    /**
     * Returns the number of cards remaining in the deck.
     */
    get remaining() {
        return this.cards.length;
    }
}
