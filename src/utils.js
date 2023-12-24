export const localStorageFloat = (key, getter) => {
  window.addEventListener('beforeunload', () => {
    localStorage.setItem(key, JSON.stringify(getter()));
  });

  return localStorage.getItem(key)
    ? isNumeric(localStorage.getItem(key))
      ? parseFloat(localStorage.getItem(key))
      : null
    : null;
};

/**
 * Check if a string is a valid number
 * inspired of https://stackoverflow.com/questions/175739/built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
 *
 * @param {string} str - string to check
 * @returns {boolean} true if it's a valid number
 */
export function isNumeric(str) {
  if (str === 0) return true;
  if (str instanceof Object) return false;
  if (typeof str == 'boolean') return false;

  return (
    !isNaN(str) && // Use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

// https://www.freecodecamp.org/news/how-to-reverse-a-string-in-javascript-in-3-different-ways-75e4763c68cb/
export const reverseString = (str) => {
  // Step 1. Use the split() method to return a new array
  const splitString = str.split(''); // var splitString = "hello".split("");
  // ["h", "e", "l", "l", "o"]

  // Step 2. Use the reverse() method to reverse the new created array
  const reverseArray = splitString.reverse(); // var reverseArray = ["h", "e", "l", "l", "o"].reverse();
  // ["o", "l", "l", "e", "h"]

  // Step 3. Use the join() method to join all elements of the array into a string
  const joinArray = reverseArray.join(''); // var joinArray = ["o", "l", "l", "e", "h"].join("");
  // "olleh"

  // Step 4. Return the reversed string
  return joinArray; // "olleh"
};

export const numberToLabel = (number) => {
  let isNegative = false;
  if (number < 0) {
    number *= -1;
    isNegative = true;
  }

  const numberString = reverseString(number + '');

  const parts = numberString.match(/.{1,3}/g);

  let result = '';
  for (let index = parts.length - 1; index >= 0; index--) {
    if (index == parts.length - 1 && isNegative) result += '-';
    result += reverseString(parts[index]);
    if (index > 0) result += ',';
  }

  return result;
};

export const numberEquals = (a, b) => {
  return Math.abs(a - b) < Number.EPSILON;
};
