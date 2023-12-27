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

export const localStorageInt = (key, getter) => {
  window.addEventListener('beforeunload', () => {
    localStorage.setItem(key, JSON.stringify(getter()));
  });

  return localStorage.getItem(key)
    ? isNumeric(localStorage.getItem(key))
      ? parseInt(localStorage.getItem(key))
      : null
    : null;
};

export const localStorageBoolean = (key, getter) => {
  window.addEventListener('beforeunload', () => {
    localStorage.setItem(key, JSON.stringify(getter()));
  });

  return localStorage.getItem(key) == 'true' ? true : false;
};

export const localStorageString = (key, getter) => {
  window.addEventListener('beforeunload', () => {
    localStorage.setItem(key, getter());
  });

  return localStorage.getItem(key) ? localStorage.getItem(key) : null;
};

export const lerp = (a, b, ratio) => {
  return a * (1 - ratio) + b * ratio;
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

export const request = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'POST', url);
    xhr.setRequestHeader(
      'Content-Type',
      options.contentType || 'application/json; charset=UTF-8'
    );
    xhr.timeout = options.timeout || 5000;

    xhr.send(JSON.stringify(options.data) || '');

    xhr.onerror = reject.bind(null, {
      status: xhr.status,
      error: 'request timeout',
    });

    xhr.onloadend = () => {
      if (xhr.readyState == 4 && xhr.status >= 200 && xhr.status < 300) {
        switch (options.responseType || 'json') {
          case 'json':
            xhr.responseText == ''
              ? resolve(null)
              : resolve(JSON.parse(xhr.responseText));
            break;
          case 'text':
            resolve(xhr.responseText);
            break;
          default:
            throw new Error('wrong responseType');
        }
      } else {
        reject({ status: xhr.status, error: xhr.responseText });
      }
    };
  });
};

export const writeTokenInCookie = (stringValue) => {
  const cookie = document.cookie === '' ? {} : JSON.parse(document.cookie);
  cookie['token'] = stringValue;
  document.cookie = JSON.stringify(cookie);
};
