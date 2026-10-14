// HandEvaluator.js - Evaluates poker hands (Texas Hold'em)

// Hand Rankings (higher is better)
export const HAND_RANKS = {
    HIGH_CARD: 1,
    ONE_PAIR: 2,
    TWO_PAIR: 3,
    THREE_OF_A_KIND: 4,
    STRAIGHT: 5,
    FLUSH: 6,
    FULL_HOUSE: 7,
    FOUR_OF_A_KIND: 8,
    STRAIGHT_FLUSH: 9,
    ROYAL_FLUSH: 10
};

export const HAND_NAMES = {
    1: 'High Card',
    2: 'One Pair',
    3: 'Two Pair',
    4: 'Three of a Kind',
    5: 'Straight',
    6: 'Flush',
    7: 'Full House',
    8: 'Four of a Kind',
    9: 'Straight Flush',
    10: 'Royal Flush'
};

/**
 * Evaluates the best 5-card hand from 7 cards.
 * @param {Card[]} cards - Array of 7 cards (2 hole + 5 community)
 * @returns {{ rank: number, name: string, score: number, bestCards: Card[] }}
 */
export function evaluateHand(cards) {
    if (cards.length < 5) {
        throw new Error('Need at least 5 cards to evaluate');
    }

    const combinations = getCombinations(cards, 5);
    let bestHand = null;

    for (const combo of combinations) {
        const result = evaluate5Cards(combo);
        if (!bestHand || result.score > bestHand.score) {
            bestHand = result;
        }
    }

    return bestHand;
}

/**
 * Evaluates exactly 5 cards.
 * @param {Card[]} cards 
 * @returns {{ rank: number, name: string, score: number, bestCards: Card[] }}
 */
function evaluate5Cards(cards) {
    const sortedCards = [...cards].sort((a, b) => b.value - a.value);
    const values = sortedCards.map(c => c.value);
    const suits = sortedCards.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = checkStraight(values);
    const isLowStraight = checkLowStraight(values);

    const valueCounts = getValueCounts(values);
    const counts = Object.values(valueCounts).sort((a, b) => b - a);

    let rank, score;

    // Royal Flush
    if (isFlush && isStraight && values[0] === 14) {
        rank = HAND_RANKS.ROYAL_FLUSH;
        score = rank * 1e10;
    }
    // Straight Flush
    else if (isFlush && (isStraight || isLowStraight)) {
        rank = HAND_RANKS.STRAIGHT_FLUSH;
        score = rank * 1e10 + (isLowStraight ? 5 : values[0]);
    }
    // Four of a Kind
    else if (counts[0] === 4) {
        rank = HAND_RANKS.FOUR_OF_A_KIND;
        const quadValue = getKeyByValue(valueCounts, 4);
        const kicker = values.find(v => v !== quadValue);
        score = rank * 1e10 + quadValue * 1e6 + kicker;
    }
    // Full House
    else if (counts[0] === 3 && counts[1] === 2) {
        rank = HAND_RANKS.FULL_HOUSE;
        const tripValue = getKeyByValue(valueCounts, 3);
        const pairValue = getKeyByValue(valueCounts, 2);
        score = rank * 1e10 + tripValue * 1e6 + pairValue;
    }
    // Flush
    else if (isFlush) {
        rank = HAND_RANKS.FLUSH;
        score = rank * 1e10 + values[0] * 1e8 + values[1] * 1e6 + values[2] * 1e4 + values[3] * 1e2 + values[4];
    }
    // Straight
    else if (isStraight || isLowStraight) {
        rank = HAND_RANKS.STRAIGHT;
        score = rank * 1e10 + (isLowStraight ? 5 : values[0]);
    }
    // Three of a Kind
    else if (counts[0] === 3) {
        rank = HAND_RANKS.THREE_OF_A_KIND;
        const tripValue = getKeyByValue(valueCounts, 3);
        const kickers = values.filter(v => v !== tripValue);
        score = rank * 1e10 + tripValue * 1e6 + kickers[0] * 1e4 + kickers[1];
    }
    // Two Pair
    else if (counts[0] === 2 && counts[1] === 2) {
        rank = HAND_RANKS.TWO_PAIR;
        const pairs = getAllKeysByValue(valueCounts, 2).sort((a, b) => b - a);
        const kicker = values.find(v => !pairs.includes(v));
        score = rank * 1e10 + pairs[0] * 1e6 + pairs[1] * 1e4 + kicker;
    }
    // One Pair
    else if (counts[0] === 2) {
        rank = HAND_RANKS.ONE_PAIR;
        const pairValue = getKeyByValue(valueCounts, 2);
        const kickers = values.filter(v => v !== pairValue);
        score = rank * 1e10 + pairValue * 1e6 + kickers[0] * 1e4 + kickers[1] * 1e2 + kickers[2];
    }
    // High Card
    else {
        rank = HAND_RANKS.HIGH_CARD;
        score = rank * 1e10 + values[0] * 1e8 + values[1] * 1e6 + values[2] * 1e4 + values[3] * 1e2 + values[4];
    }

    return {
        rank,
        name: HAND_NAMES[rank],
        score,
        bestCards: sortedCards
    };
}

/**
 * Checks if values form a straight (consecutive).
 */
function checkStraight(values) {
    for (let i = 0; i < values.length - 1; i++) {
        if (values[i] - values[i + 1] !== 1) return false;
    }
    return true;
}

/**
 * Checks for A-2-3-4-5 (wheel) straight.
 */
function checkLowStraight(values) {
    const lowStraight = [14, 5, 4, 3, 2];
    return JSON.stringify(values) === JSON.stringify(lowStraight);
}

/**
 * Counts occurrences of each value.
 */
function getValueCounts(values) {
    const counts = {};
    for (const v of values) {
        counts[v] = (counts[v] || 0) + 1;
    }
    return counts;
}

/**
 * Gets the first key with a given value.
 */
function getKeyByValue(obj, value) {
    for (const key in obj) {
        if (obj[key] === value) return parseInt(key);
    }
    return null;
}

/**
 * Gets all keys with a given value.
 */
function getAllKeysByValue(obj, value) {
    const keys = [];
    for (const key in obj) {
        if (obj[key] === value) keys.push(parseInt(key));
    }
    return keys;
}

/**
 * Generates all k-combinations from an array.
 */
function getCombinations(arr, k) {
    const result = [];

    function combine(start, combo) {
        if (combo.length === k) {
            result.push([...combo]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }

    combine(0, []);
    return result;
}

/**
 * Compares two hands. Returns positive if hand1 wins, negative if hand2 wins, 0 for tie.
 * @param {Card[]} hand1 
 * @param {Card[]} hand2 
 * @returns {number}
 */
export function compareHands(hand1, hand2) {
    const eval1 = evaluateHand(hand1);
    const eval2 = evaluateHand(hand2);
    return eval1.score - eval2.score;
}
