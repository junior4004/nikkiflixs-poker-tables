// Card.js - Represents a playing card

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Mapping for display
const SUIT_SYMBOLS = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
};

const SUIT_COLORS = {
    hearts: 'red',
    diamonds: 'red',
    clubs: 'black',
    spades: 'black'
};

export class Card {
    /**
     * @param {string} rank - The rank of the card (2-10, J, Q, K, A)
     * @param {string} suit - The suit of the card (hearts, diamonds, clubs, spades)
     */
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
        this.value = RANKS.indexOf(rank) + 2; // 2=2, ..., A=14
    }

    /**
     * Returns the suit symbol (♥, ♦, ♣, ♠)
     */
    get symbol() {
        return SUIT_SYMBOLS[this.suit];
    }

    /**
     * Returns the color (red or black)
     */
    get color() {
        return SUIT_COLORS[this.suit];
    }

    /**
     * Returns a string representation of the card
     */
    toString() {
        return `${this.rank}${this.symbol}`;
    }

    /**
     * Creates the HTML element for the card
     * @param {boolean} faceUp - Whether the card is face up
     * @returns {HTMLElement}
     */
    createElement(faceUp = true) {
        const card = document.createElement('div');
        card.classList.add('card');
        card.dataset.rank = this.rank;
        card.dataset.suit = this.suit;

        if (faceUp) {
            card.classList.add('face-up', this.color);
            card.innerHTML = `
                <span class="card-corner top-left">
                    <span class="card-rank">${this.rank}</span>
                    <span class="card-suit">${this.symbol}</span>
                </span>
                <span class="card-center">${this.symbol}</span>
                <span class="card-corner bottom-right">
                    <span class="card-rank">${this.rank}</span>
                    <span class="card-suit">${this.symbol}</span>
                </span>
            `;
        } else {
            card.classList.add('face-down');
            card.innerHTML = `<span class="card-back-pattern"></span>`;
        }

        return card;
    }
}
