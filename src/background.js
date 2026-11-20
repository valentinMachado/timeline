/**
 * The background script: opens the reader's timeline in a tab, from the
 * extension's toolbar button (the menu, on Firefox for Android) or when the
 * banner of a page asks for it.
 */

import { MY_TIMELINE_PAGE, OPEN_MY_TIMELINE } from "./manifest.js";

/** Opens the reader's timeline in a new tab. */
function openMyTimeline() {
  chrome.tabs.create({ url: chrome.runtime.getURL(MY_TIMELINE_PAGE) });
}

chrome.action.onClicked.addListener(openMyTimeline);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.open === OPEN_MY_TIMELINE.open) openMyTimeline();
});
