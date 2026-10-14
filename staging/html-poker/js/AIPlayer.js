// AIPlayer.js - AI opponent with rule-based strategy

import { Player } from './Player.js';
import { evaluateHand, HAND_RANKS } from './HandEvaluator.js';

/**
 * Chen Formula for pre-flop hand strength (simplified).
 * Returns a score from 0-20.
 */
function chenFormula(card1, card2) {
    // Guard against undefined cards
    if (!card1 || !card2) return 0;

    let score = 0;

    // Start with highest card score
    const highCard = Math.max(card1.value, card2.value);
    if (highCard === 14) score = 10;      // Ace
    else if (highCard === 13) score = 8;  // King
    else if (highCard === 12) score = 7;  // Queen
    else if (highCard === 11) score = 6;  // Jack
    else score = highCard / 2;

    // Pairs
    if (card1.value === card2.value) {
        score = Math.max(5, score * 2);
    }

    // Suited bonus
    if (card1.suit === card2.suit) {
        score += 2;
    }

    // Gap penalty
    const gap = Math.abs(card1.value - card2.value) - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;

    // Straight potential bonus for connected cards
    if (gap <= 1 && highCard < 12) {
        score += 1;
    }

    return Math.max(0, Math.round(score));
}

/**
 * Calculate hand strength percentage (post-flop).
 * Simple approximation based on hand rank.
 */
function getHandStrength(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards];
    if (allCards.length < 5) return 0.5; // Default for pre-flop

    const result = evaluateHand(allCards);

    // Map hand rank to a rough win percentage
    const strengthMap = {
        [HAND_RANKS.HIGH_CARD]: 0.2,
        [HAND_RANKS.ONE_PAIR]: 0.35,
        [HAND_RANKS.TWO_PAIR]: 0.52,
        [HAND_RANKS.THREE_OF_A_KIND]: 0.65,
        [HAND_RANKS.STRAIGHT]: 0.75,
        [HAND_RANKS.FLUSH]: 0.82,
        [HAND_RANKS.FULL_HOUSE]: 0.90,
        [HAND_RANKS.FOUR_OF_A_KIND]: 0.97,
        [HAND_RANKS.STRAIGHT_FLUSH]: 0.99,
        [HAND_RANKS.ROYAL_FLUSH]: 1.0
    };

    return strengthMap[result.rank] || 0.5;
}

export class AIPlayer extends Player {
    /**
     * @param {string} id 
     * @param {string} name 
     * @param {number} chips 
     * @param {'tight' | 'loose' | 'aggressive'} style - Playing style
     */
    constructor(id, name, chips = 1000, style = 'tight') {
        super(id, name, chips, true);
        this.style = style;

        // Style modifiers
        this.aggressionFactor = style === 'aggressive' ? 1.3 : (style === 'loose' ? 1.1 : 1.0);
        this.callThreshold = style === 'tight' ? 0.35 : (style === 'loose' ? 0.25 : 0.30);
        this.raiseThreshold = style === 'tight' ? 0.55 : (style === 'loose' ? 0.45 : 0.50);

        // Bluffing parameters - makes AI less predictable
        this.bluffFrequency = style === 'aggressive' ? 0.25 : (style === 'loose' ? 0.18 : 0.10);
        this.semiBluffFrequency = style === 'aggressive' ? 0.40 : (style === 'loose' ? 0.30 : 0.20);
        this.stealFrequency = style === 'aggressive' ? 0.35 : (style === 'loose' ? 0.25 : 0.15);
    }

    /**
     * Decide an action given the current game state.
     * @param {object} gameState 
     * @returns {{ action: 'fold' | 'check' | 'call' | 'raise', amount?: number }}
     */
    decideAction(gameState) {
        // Guard against no hole cards (eliminated player)
        if (!this.holeCards || this.holeCards.length < 2) {
            return { action: 'fold' };
        }

        const { communityCards, currentBet, pot, bigBlind } = gameState;
        const toCall = currentBet - this.currentBet;

        // Calculate min and max raise for validity
        const minRaise = gameState.minRaise || bigBlind;
        const minRaiseTotal = currentBet + minRaise; // Minimum total bet for a raise
        const maxBet = this.chips + this.currentBet; // Maximum total bet (all-in)

        let decision;

        // Pre-flop: Use Chen formula
        if (communityCards.length === 0) {
            decision = this.preFlopDecision(toCall, bigBlind, pot, currentBet, minRaiseTotal, maxBet);
        } else {
            // Post-flop: Use hand strength
            decision = this.postFlopDecision(communityCards, toCall, bigBlind, pot, currentBet, minRaiseTotal, maxBet);
        }

        // Validate the decision
        return this.validateDecision(decision, toCall, currentBet, minRaiseTotal, maxBet);
    }

    /**
     * Validate and correct the decision to ensure it's legal.
     */
    validateDecision(decision, toCall, currentBet, minRaiseTotal, maxBet) {
        const { action, amount } = decision;

        switch (action) {
            case 'check':
                // Can only check if there's nothing to call
                if (toCall > 0) {
                    return { action: 'fold' };
                }
                return { action: 'check' };

            case 'call':
                // If nothing to call, check instead
                if (toCall === 0) {
                    return { action: 'check' };
                }
                return { action: 'call' };

            case 'raise':
                // Ensure raise amount is valid (total bet format)
                let raiseTotal = amount || minRaiseTotal;

                // Ensure it's at least the minimum raise
                if (raiseTotal < minRaiseTotal) {
                    raiseTotal = minRaiseTotal;
                }

                // Cap at max bet (all-in)
                if (raiseTotal > maxBet) {
                    raiseTotal = maxBet;
                }

                // If we can't afford minimum raise, just call or check
                if (this.chips <= toCall) {
                    return toCall > 0 ? { action: 'call' } : { action: 'check' };
                }

                return { action: 'raise', amount: raiseTotal };

            case 'fold':
            default:
                return { action: 'fold' };
        }
    }

    /**
     * Pre-flop decision based on Chen score.
     */
    preFlopDecision(toCall, bigBlind, pot, currentBet, minRaiseTotal, maxBet) {
        const chenScore = chenFormula(this.holeCards[0], this.holeCards[1]);

        // Premium hands (AA, KK, QQ, AKs) - always raise
        if (chenScore >= 10) {
            const raiseSize = Math.min(pot, this.chips);
            const raiseTotal = currentBet + raiseSize;
            return { action: 'raise', amount: Math.min(raiseTotal, maxBet) };
        }

        // Strong hands - raise or call
        if (chenScore >= 7) {
            if (toCall === 0) {
                return { action: 'raise', amount: minRaiseTotal + bigBlind * 2 };
            }
            if (toCall <= bigBlind * 4) {
                // Sometimes raise (add unpredictability)
                if (Math.random() > 0.6 / this.aggressionFactor) {
                    return { action: 'raise', amount: currentBet + bigBlind * 3 };
                }
                return { action: 'call' };
            }
            return { action: 'fold' };
        }

        // Medium hands - call small raises
        if (chenScore >= 5) {
            if (toCall === 0) {
                return Math.random() > 0.5 ? { action: 'check' } : { action: 'raise', amount: minRaiseTotal };
            }
            if (toCall <= bigBlind * 2) {
                return { action: 'call' };
            }
            return { action: 'fold' };
        }

        // Weak hands - fold to any raise
        if (toCall === 0) {
            return { action: 'check' };
        }
        return { action: 'fold' };
    }

    /**
     * Post-flop decision based on hand strength with bluffing.
     */
    postFlopDecision(communityCards, toCall, bigBlind, pot, currentBet, minRaiseTotal, maxBet) {
        const strength = getHandStrength(this.holeCards, communityCards);
        const random = Math.random();

        // Check for draw potential (semi-bluff opportunities)
        const hasDrawPotential = this.checkDrawPotential(communityCards);

        // Very strong hand - value bet/raise (sometimes slow-play)
        if (strength >= this.raiseThreshold) {
            // Occasionally slow-play monster hands
            if (strength > 0.85 && random < 0.15) {
                return toCall === 0 ? { action: 'check' } : { action: 'call' };
            }
            const raiseSize = Math.floor(pot * (0.5 + Math.random() * 0.5) * this.aggressionFactor);
            const raiseTotal = currentBet + Math.max(bigBlind, raiseSize);
            return { action: 'raise', amount: Math.min(raiseTotal, maxBet) };
        }

        // Decent hand - call, check, or bet
        if (strength >= this.callThreshold) {
            if (toCall === 0) {
                // Bet for value with some randomization
                if (random < 0.5 * this.aggressionFactor) {
                    const betSize = Math.floor(pot * (0.3 + Math.random() * 0.4));
                    return { action: 'raise', amount: Math.max(minRaiseTotal, betSize) };
                }
                return { action: 'check' };
            }

            // Call if pot odds are favorable
            const potOdds = toCall / (pot + toCall);
            if (strength > potOdds) {
                return { action: 'call' };
            }
            return { action: 'fold' };
        }

        // Weak hand - bluffing opportunities
        if (toCall === 0) {
            // Semi-bluff with draws
            if (hasDrawPotential && random < this.semiBluffFrequency) {
                const bluffSize = Math.floor(pot * (0.5 + Math.random() * 0.3));
                return { action: 'raise', amount: Math.max(minRaiseTotal, bluffSize) };
            }
            // Pure bluff
            if (random < this.bluffFrequency) {
                const bluffSize = Math.floor(pot * (0.4 + Math.random() * 0.4));
                return { action: 'raise', amount: Math.max(minRaiseTotal, bluffSize) };
            }
            return { action: 'check' };
        }

        // Facing a bet with weak hand
        // Sometimes bluff-raise (represent strength)
        if (random < this.bluffFrequency * 0.4 && toCall < pot * 0.3) {
            const bluffRaise = currentBet + Math.floor(pot * 0.6);
            return { action: 'raise', amount: Math.min(bluffRaise, maxBet) };
        }

        // Float call (call to bluff later) - only with draws or position
        if (hasDrawPotential && toCall < pot * 0.25 && random < this.semiBluffFrequency * 0.5) {
            return { action: 'call' };
        }

        return { action: 'fold' };
    }

    /**
     * Check if hand has draw potential (flush/straight draws).
     */
    checkDrawPotential(communityCards) {
        if (communityCards.length < 3) return false;

        const allCards = [...this.holeCards, ...communityCards];
        const suits = allCards.map(c => c.suit);
        const values = allCards.map(c => c.value).sort((a, b) => a - b);

        // Flush draw (4 of same suit)
        const suitCounts = {};
        suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
        const hasFlushDraw = Object.values(suitCounts).some(c => c >= 4);

        // Straight draw (4 consecutive or gutshot)
        let consecutiveCount = 1;
        for (let i = 1; i < values.length; i++) {
            if (values[i] - values[i - 1] === 1) consecutiveCount++;
            else if (values[i] !== values[i - 1]) consecutiveCount = 1;
        }
        const hasStraightDraw = consecutiveCount >= 4;

        return hasFlushDraw || hasStraightDraw;
    }
}
