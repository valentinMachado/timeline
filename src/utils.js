export const localStorageFloat = (key, getter) => {
  window.addEventListener('beforeunload', () => {
    localStorage.setItem(key, JSON.stringify(getter()));
  });

  return localStorage.getItem(key)
    ? parseFloat(localStorage.getItem(key))
    : null;
};
