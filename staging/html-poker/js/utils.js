// utils.js - Utility functions for the poker game

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param {Array} array - The array to shuffle.
 * @returns {Array} The shuffled array.
 */
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Creates a delay (for animations).
 * @param {number} ms - Milliseconds to delay.
 * @returns {Promise}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats a chip amount with commas.
 * @param {number} amount 
 * @returns {string}
 */
export function formatChips(amount) {
    return amount.toLocaleString();
}
