// Player.js - Base class for poker player state

export class Player {
    /**
     * @param {string} id - Unique identifier
     * @param {string} name - Display name
     * @param {number} chips - Starting chips
     * @param {boolean} isAI - Whether this is an AI player
     */
    constructor(id, name, chips = 1000, isAI = false) {
        this.id = id;
        this.name = name;
        this.chips = chips;
        this.isAI = isAI;

        // Game state
        this.holeCards = [];
        this.currentBet = 0;
        this.totalBetThisRound = 0;
        this.hasFolded = false;
        this.isAllIn = false;
        this.hasActed = false;
        this.isDealer = false;
        this.seatIndex = -1;
    }

    /**
     * Check if player is active in the current hand (not folded, has chips or is all-in).
     */
    get isActive() {
        return !this.hasFolded && (this.chips > 0 || this.isAllIn);
    }

    /**
     * Check if player can take an action (has chips, not folded, not all-in).
     */
    get canAct() {
        return this.chips > 0 && !this.hasFolded && !this.isAllIn;
    }

    /**
     * Resets state for a new hand.
     */
    resetForNewHand() {
        this.holeCards = [];
        this.currentBet = 0;
        this.totalBetThisRound = 0;
        this.hasFolded = false;
        this.isAllIn = false;
        this.hasActed = false;
    }

    /**
     * Resets state for a new betting round.
     */
    resetForNewRound() {
        this.currentBet = 0;
        this.hasActed = false;
    }

    /**
     * Place a bet (call, raise, or blind).
     * @param {number} amount 
     * @returns {number} The actual amount bet (may be less if all-in)
     */
    bet(amount) {
        const actualBet = Math.min(amount, this.chips);
        this.chips -= actualBet;
        this.currentBet += actualBet;
        this.totalBetThisRound += actualBet;

        if (this.chips === 0) {
            this.isAllIn = true;
        }

        this.hasActed = true;
        return actualBet;
    }

    /**
     * Fold the hand.
     */
    fold() {
        this.hasFolded = true;
        this.hasActed = true;
    }

    /**
     * Check (bet 0).
     */
    check() {
        this.hasActed = true;
    }

    /**
     * Receive dealt cards.
     * @param {Card[]} cards 
     */
    receiveCards(cards) {
        this.holeCards = cards;
    }

    /**
     * Win chips (added to stack).
     * @param {number} amount 
     */
    winChips(amount) {
        this.chips += amount;
    }

    /**
     * Serialize for network transmission.
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            chips: this.chips,
            isAI: this.isAI,
            currentBet: this.currentBet,
            totalBetThisRound: this.totalBetThisRound,
            hasFolded: this.hasFolded,
            isAllIn: this.isAllIn,
            hasActed: this.hasActed,
            isDealer: this.isDealer,
            seatIndex: this.seatIndex,
            // Note: holeCards only sent to the player themselves in multiplayer
            holeCardsCount: this.holeCards.length
        };
    }
}
