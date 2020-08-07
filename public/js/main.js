/*
Copyright 2020 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/* globals gtag */

const form = document.getElementById('search');
const infoElement = document.getElementById('info');
const matchesList = document.getElementById('matches');
const queryInfoElement = document.getElementById('query-info');
const queryInput = document.getElementById('query');

let startTime;

const baseUrl = `${window.location.origin}${window.location.pathname}`;

const SEARCH_QUERY_PAGE_LOCATION = `https://glitch.com/#!/sqlite-search/search?q=`;
const SEARCH_QUERY_PAGE_PATH = `/search?q=`;

queryInput.onkeydown = () => {
  // Do a search if the user presses the enter or return key.
  if (event.key === 'Enter' || event.key === 'Tab') {
    search();
  }
};

queryInput.oninput = () => {
  // Enable :invalid CSS if input is not empty.
  if (queryInput.value.length > 0) {
    queryInput.classList.add('validate');
  } else {
    queryInput.classList.remove('validate');
  }
};

form.onsubmit = (event) => {
  event.preventDefault();
  search(queryInput.value);
};

function search(query) {
  doAnalytics(query);
  matchesList.textContent = '';
  startTime = window.performance.now();
  console.time(`Do search for '${query}'`);
  fetch(`/search?q=${queryInput.value}`)
    .then((response) => response.json())
    .then((matches) => {
      handleSearchResponse(query, matches);
    }).catch((error) => {
      console.error(`search() error for query ${query}\n`, error);
    });
}

function handleSearchResponse(query, matches) {
  console.log('handleSearchResponse() matches:', matches);
  console.timeEnd(`Do search for '${query}'`);
  const elapsed = Math.round(window.performance.now() - startTime) / 1000;
  // Show search results (matches)
  show(matchesList);
  // Scroll back to top in case user has scrolled down.
  window.scroll(0, 0);
  const message = `Found ${matches.length} match(es) in ${elapsed} seconds`;
  displayInfo(message);
  queryInfoElement.textContent = 'Click on a match to view video';
  displayMatches(query, matches);
}

function displayMatches(query, matches) {
  hide(infoElement);
  hide(infoElement);
  hide(matchesList);
  matchesList.textContent = '';
  hide(queryInfoElement);
  // filter matches here if necessary (see https://samdutton.github.io/wdl)
  if (matches.length > 0) {
    show(infoElement);
    show(matchesList);
    show(queryInfoElement);
    for (const match of matches) {
      addMatch(match);
    }
  } else {
    displayInfo('No matches :^\\');
    queryInfoElement.textContent = '';
  }
}

function addMatch(match) {
  const matchElement = document.createElement('li');
  matchElement.dataset.time = match.time;
  matchElement.dataset.video = match.video;
  matchElement.textContent = match.text;
  // matchElement.title = match.speaker;
  matchElement.onclick = () => {
    const state = {type: 'caption', video: match.video, time: match.time};
    const title = `Caption: ${match.video, match.time}`;
    const url = `${baseUrl}?v=${match.video}&t=${match.time}`;
    history.pushState(state, title, url);
    document.title = title;
    displayCaption(match);
  };
  matchesList.appendChild(matchElement);
}

// Display the appropriate video and caption when a user taps/clicks on a match
// or opens a URL with a video and (optionally) a time parameter
function displayCaption(match) {
  console.log('match:', match);
}


/*
// client-side js
// run by the browser each time your view template referencing it is loaded

console.log("hello world :o");

const dreams = [];

// define variables that reference elements on our page
const dreamsForm = document.forms[0];
const dreamInput = dreamsForm.elements["dream"];
const dreamsList = document.getElementById("dreams");
const clearButton = document.querySelector('#clear-dreams');

// request the dreams from our app's sqlite database
fetch("/getDreams", {})
  .then(res => res.json())
  .then(response => {
    response.forEach(row => {
      appendNewDream(row.dream);
    });
  });

// a helper function that creates a list item for a given dream
const appendNewDream = dream => {
  const newListItem = document.createElement("li");
  newListItem.innerText = dream;
  dreamsList.appendChild(newListItem);
};

// listen for the form to be submitted and add a new dream when it is
dreamsForm.onsubmit = event => {
  // stop our form submission from refreshing the page
  event.preventDefault();

  const data = { dream: dreamInput.value };

  fetch("/addDream", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  })
    .then(res => res.json())
    .then(response => {
      console.log(JSON.stringify(response));
    });
  // get dream value and add it to the list
  dreams.push(dreamInput.value);
  appendNewDream(dreamInput.value);

  // reset form
  dreamInput.value = "";
  dreamInput.focus();
};

clearButton.addEventListener('click', event => {
  fetch("/clearDreams", {})
    .then(res => res.json())
    .then(response => {
      console.log("cleared dreams");
    });
  dreamsList.innerHTML = "";
});

*/

function doAnalytics() {
  // Add Google Analytics tracking for searches.
  gtag('config', 'UA-174913118-1', {
    'page_title': 'search',
    'page_location': `${SEARCH_QUERY_PAGE_LOCATION}${query}`,
    'page_path': `${SEARCH_QUERY_PAGE_PATH}${query}`,
  });
}

// Utility functions

// Display information to the user.
function displayInfo(html) {
  infoElement.innerHTML = html;
  show(infoElement);
}

function hide(element) {
  element.classList.add('hidden');
}

function show(element) {
  element.classList.remove('hidden');
}
