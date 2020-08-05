const queryInput = document.getElementById('query');
const form = document.getElementById('search');

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
  search();
};

function search() {
  console.log('Query; ', queryInput.value);
  fetch(`/search?q=${queryInput.value}`)
    .then((response) => response.json())
    .then((json) => {
      console.log('Response:', json);
    });
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