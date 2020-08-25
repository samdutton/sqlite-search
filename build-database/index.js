/**
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


const Database = require('better-sqlite3');
const fs = require('fs');
const fsPromises = require('fs').promises;
const recursive = require('recursive-readdir');
// const rimraf = require('rimraf');
const subtitle = require('subtitle');
const validator = require('html-validator');

// Errors for HTML validator to ignore.
// <head> errors are mostly to allow validation when not writing complete page.
const VALIDATOR_IGNORE = [
  'Error: Bad value “https://www.youtube.com/embed/${videoId}?enablejsapi=1” ' +
    'for attribute “src” on element “iframe”: Illegal character in path ' +
    'segment: “{” is not allowed.',
  'Error: Bogus comment.',
  'Error: Element “head” is missing a required instance of child element “title”.',
  'Error: Start tag seen without seeing a doctype first. Expected “<!DOCTYPE html>”.',
  'Start tag seen without seeing a doctype first. Expected “<!DOCTYPE html>”.',
  'Error: Stray doctype.',
  'Warning: Section lacks heading. Consider using "h2"-"h6" elements to ' +
    'add identifying headings to all sections.'];

let CREATE_STANDALONE_HOMEPAGE = true; // index page linking to standalone transcripts
const ERROR_LOG = 'error-log.txt';
const VERSION = '1.0 beta';

// Get the boilerplate text fragments for the top and bottom
// of a standalone HTML page.
const HTML_TOP = fs.readFileSync('./html-fragments/top.html', 'utf8');
const HTML_BOTTOM = fs.readFileSync('./html-fragments/bottom.html', 'utf8');

// Used to put each speaker in a span.speaker.
// This is done after the caption text is put in a span,
// hence the > before the match
const SPEAKER_REGEX = /^([A-Z1-9 \-]+): */;

let currentSpeaker;
let DO_VALIDATION = false;
let numCaptions = 0;
let numErrors = 0;
let numSrtFiles = 0;
let numSrtFilesProcessed = 0;
const speakers = new Set();
const videoIds = [];

const DB_FILE = '../captions.db';
const TABLE_NAME = 'captions';
const TABLE_COLUMNS = '(video TEXT, time TEXT, text TEXT)';

// Use ../docs for integration with GitHub Pages.
let APP_DIR = '../public';
const APP_TRANSCRIPTS_DIR = `${APP_DIR}/transcripts`;
let SRT_DIR = 'srt';
const STANDALONE_DIR = `${APP_DIR}/standalone`;
const STANDALONE_TRANSCRIPTS_DIR = `${APP_DIR}/standalone/transcripts`;
const SPEAKERS_DATA_FILEPATH = `${APP_DIR}/data/speakers.json`;

const argv = require('yargs')
  .alias('a', 'append')
  .alias('c', 'index')
  .alias('d', 'data')
  .alias('h', 'help')
  .alias('i', 'input')
  .alias('l', 'validate')
  .alias('o', 'output')
  .describe('a', 'Append/overwrite: don\'t delete existing files in output directory')
  // Create 'homepage' linking to readable transcript 'pages'.
  // This is just to enable browsing by video ID instead of using search.
  .describe('c', `Create index page linking to standalone transcripts, ` +
    `default is ${CREATE_STANDALONE_HOMEPAGE}`)
  .describe('d', 'Create document for caption data (for third party indexing)')
  .describe('i', `Input directory, default is ${SRT_DIR}`)
  .describe('l', 'Validate HTML output')
  .describe('o', `Output directory, default is ${APP_DIR}`)
  .describe('s', 'build database file')
  .help('h')
  .argv;

// To avoid running other code when getting the app version, this must go first.
if (argv.v) {
  console.log(`${VERSION}`);
  process.exit();
}

if (argv.c) {
  CREATE_STANDALONE_HOMEPAGE = argv.c; // index page for standalone transcripts
}

if (argv.i) {
  SRT_DIR = argv.i;
}

if (argv.l) {
  DO_VALIDATION = true;
}

if (argv.o) {
  APP_DIR = argv.o;
}

// Delete database file and rebuild.
fs.unlinkSync(DB_FILE);
const db = new Database(DB_FILE);
const createTable = db.prepare(`CREATE TABLE ${TABLE_NAME} ${TABLE_COLUMNS}`);
createTable.run();
const insertCaption = db.prepare(`INSERT INTO  ${TABLE_NAME} VALUES (@video, @time, @text)`);

// The insertCaptions function is called for each video from processCaptions().
const insertCaptions = db.transaction((captions) => {
  for (const caption of captions) {
    insertCaption.run(caption);
  }
});

processSrtFiles();

// Parse each SRT caption file in the input directory.
function processSrtFiles() {
  recursive(SRT_DIR).then((filepaths) => {
    filepaths = filepaths.filter((filename) => {
      // When running on Mac :/
      if (filename.includes('.DS_Store')) {
        return false;
      // Filename should be <YouTubeID>.srt
      } else if (!filename.match(/[a-zA-Z0-9_-]{11}.srt/)) {
        const message =
          `Input directory ${SRT_DIR} contains stray file ${filename}`;
        displayError(message);
        logError(message);
      } else {
        return true;
      }
    });
    // These variables are used to check when all SRT files have been processed.
    numSrtFiles = filepaths.length;

    // Format looks odd :) but is designed to display like this:
    //   Time to process 13961 captions
    //   from 35 transcripts: 5658.839ms
    console.time(`from ${numSrtFiles} transcripts`);
    console.log('\n');

    for (const filepath of filepaths) {
      processSrtFile(filepath);
    }
  }).catch((error) => displayError(`Error reading from ${SRT_DIR}:`, error));
}

// For each SRT caption file in ${SRT_DIR}, i.e. each transcript:
// • Get the video ID.
// • Parse the text.
async function processSrtFile(filepath) {
  try {
    const data = await fsPromises.readFile(filepath, {encoding: 'utf8'});
    const videoId = filepath.match(/\/(.+).srt/)[1];
    videoIds.push(videoId);
    processSrtText(videoId, data.trim());
  } catch (error) {
    displayError(`Error reading file ${filepath}:`, error);
  }
}

// Parse each SRT file to get the captions.
// Once all the files have been processed, create a homepage for the
// standalone transcripts and write the serialised search index file.
function processSrtText(videoId, text) {
  // Parse the SRT file to create an array of captions using the
  // subtitle module: npmjs.com/package/subtitle#parsesrt-string---array.
  let captions = subtitle.parse(text);

  // Remove empty captions.
  captions = captions.filter((caption) => {
    return caption.text; // filter out captions without a text value
  });

  // Create an HTML transcript file from captions for each video
  // and add each caption to the database.
  processVideoData(videoId, captions);

  // When all SRT files have been parsed:
  // • Create an HTML homepage linking to standalone transcript files.
  // • Write the serialized search index to a file.
  if (++numSrtFilesProcessed === numSrtFiles) {
    console.log(`\nTime to process ${numCaptions} captions`);
    // Format looks odd :) but is designed to display like this:
    //   Time to process 13961 captions
    //   from 35 transcripts: 5658.839ms
    console.timeEnd(`from ${numSrtFiles} transcripts`);
    console.log('\n');
    if (numErrors) {
      displayError(`Completed with ${numErrors} errors.`);
    }
    // Create 'homepage' linking to standalone video transcript 'pages'.
    if (CREATE_STANDALONE_HOMEPAGE) {
      createStandaloneHomePage();
    }
    writeFile(SPEAKERS_DATA_FILEPATH, JSON.stringify([...speakers].sort()));
    console.log(`Wrote data for ${speakers.size} speakers\n`);
  }
}

// Process the captions for each video:
// • Create readable HTML transcript.
// • Add captions to the database.
function processVideoData(videoId, captions) {
  // Start by opening section and p elements.
  let html = '<section>\n<p>';
  numCaptions += captions.length;
  console.log(`Processing ${captions.length} captions ` +
    `for \x1b[97m${STANDALONE_DIR}/transcripts/${videoId}.html\x1b[0m`);

  html += processCaptions(videoId, captions);

  // End whole transcript by adding closing tags for p and section elements.
  html += '</p>\n</section>';
  html = fixTextGlitches(html);

  // ${videoId} is used as a placeholder in top.html.
  const htmlStandalone =
      HTML_TOP.replace(/\${videoId}/g, videoId) +
      html +
      HTML_BOTTOM;
  const standaloneFilepath = `${STANDALONE_TRANSCRIPTS_DIR}/${videoId}.html`;
  const searchFilepath = `${APP_TRANSCRIPTS_DIR}/${videoId}.html`;
  // If validation not requested, just write the file.
  validateThenWrite(standaloneFilepath, htmlStandalone);
  validateThenWrite(searchFilepath, html);
}

// Process the captions for a single video:
// • Tweak the caption text and start time values.
// • Parse the caption text to get speaker names where possible.
// . Create HTML for each caption (for the readable transcripts).
// • Add the caption data to the database: video ID, start time, caption text.
function processCaptions(videoId, captions) {
  // console.log(`processCaptions() for ${videoId}`);
  let html = '';
  // Randomly set the maximum number of spans allowed in a paragraph.
  let max = getRandom(3, 15);
  // speechLength corresponds to the number of span elements used since a
  // paragraph break was added (see below) to break up long speeches.
  let speechLength = 0;

  // Values to be inserted in database.
  const values = [];

  for (const caption of captions) {
    // Replace line breaks in the captions and remove any stray whitespace.
    caption.text = caption.text.
      replace(/\n/, ' ').
      // The subtitle module returns 'undefined' for blank lines
      // https://github.com/gsantiago/subtitle.js/issues/43
      replace('undefined', '').
      trim();

    // caption.text is plain text that will be used for searching the caption database.
    // caption.html will be marked up for transcript HTML.
    caption.html = caption.text;

    // Reset speechLength each time there's a new speaker.
    if (SPEAKER_REGEX.test(caption.text)) {
      speechLength = 0;
    }
    caption.text = caption.text.
      // Remove speaker names from caption text so they aren't searched as caption content.
      replace(SPEAKER_REGEX, '');
    // Escape single quotes to enable database insert statement.
    // replace(/'/g, `''`);
    // Test for dodgy characters, just in case.
    if (/^[{Letter} .\-?]+$/.test(caption.text)) {
      logError(`Found unexpected character in caption: ${caption.text}`);
    }
    caption.speaker = currentSpeaker, // Reset whenever handleSpeakerNames() called (above).
    caption.time = caption.start / 1000, // SRT uses milliseconds; YouTube uses seconds.
    caption.video = videoId;

    // TODO: Add speaker if able to parse captions for speakers.
    // Values are inserted in database in one operation per video.
    values.push({
      video: caption.video,
      time: caption.time,
      text: caption.text,
    });

    // Check for a change of speaker and add markup to speaker names.
    caption.html = handleSpeakerNames(caption.html);

    // For readability, break up long speeches into paragraphs.
    // Attempt to break only at end of sentences.
    // Sentences almost always start at the beginning of captions.
    if (++speechLength > max && caption.text.match(/^[A-Z]/)) {
      html += '</p>\n<p>';
      speechLength = 0;
      max = getRandom(3, 15); // reset
    }

    // NB: This must come after handleSpeakerNames() is called.
    // Add space at end of every caption (these aren't in the SRT) to ensure
    // space between words, and after sentence endings.
    // Note that SRT timings are in milliseconds whereas YouTube uses seconds.
    caption.html = `<span data-start="${caption.start / 1000}" ` +
      `data-end="${caption.end / 1000}">${caption.html}</span> `;
    // Add a paragraph and section break before each new speaker.
    if (caption.html.includes('class="speaker"')) {
      html += '</p>\n</section>\n\n<section>\n<p>';
    }
    html += caption.html;
  } // end processing captions

  insertCaptions(captions);

  return html;
}


// Create index page linking to transcripts.
function createStandaloneHomePage() {
  let html =
    `<html lang="en">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="images/icons/icon192.png">
    <style>
    body {
      font-family: Google Sans, sans-serif;
      margin: 40px;
    }
    </style>
    `;
  for (const videoId of videoIds) {
    html += `<p><a href="transcripts/${videoId}.html">${videoId}</a><p>\n`;
  }
  const standaloneIndex = `${STANDALONE_DIR}/index.html`;
  writeFile(standaloneIndex, html);
  console.log(`Created index page linking to standalone transcripts: ` +
      `\x1b[97m${standaloneIndex}\x1b[0m`);
}

// Check the text of each caption for speaker names.
// Whenever the current speaker changes:
// • Reset the currentSpeaker value.
// • Add HTML formatting.
function handleSpeakerNames(text) {
  return text.replace(SPEAKER_REGEX, (match, p1) => {
    currentSpeaker = formatName(p1);
    speakers.add(currentSpeaker);
    return `<span class="speaker">${currentSpeaker}</span>: `;
  });
}

// Correct and capitalize speaker names (Fred Nerk not FRED NERK).
// This is much more of a problem for the older transcripts.
function formatName(name) {
  return capitalize(name)
    // TODO: Fixe these in the YouTube captions
    .replace('Francois', 'François')
    .replace('Hemperius', 'Hempenius')
    .replace('Speaker 1', 'Paul Lewis')
    .replace('Speaker 2', 'Timothy Jordan');
}

// Fix minor glitches in caption text.
// These are present in older transcripts (not the CDS ones).
function fixTextGlitches(html) {
  return html.
    replace(/>>> /gm, 'Audience member: ').
    replace(/&gt;&gt; ?/gm, '').
    replace(/&amp;gt;&amp;gt; ?/gm, '').
    replace(/&amp;gt; ?/gm, '').
    replace(/AUDIENCE/, 'Audience').
    replace(/AUDIENCE MEMBER/, 'Audience member').
    replace(/^>+/gm, '').
    replace(/&#39;/gm, '\'').
    replace(/&amp;#39;/gm, '\'').
    replace(/&quot;/gm, '\'').
    replace(/&amp;quot;/gm, '\'').
    replace(/\.\./gm, '.'). // this and the next used with [INAUDIBLE]
    replace(/,,/gm, '.').
    replace(/--/gm, ' — ').
    replace(/ - /gm, ' — ');
}

//  Utility functions

// From stackoverflow.com/questions/17200640/javascript-capitalize-
// first-letter-of-each-word-in-a-string-only-if-lengh-2?rq=1
function capitalize(string) {
  return string.toLowerCase().replace(/\b[a-z](?=[a-z]+)/g,
    function(letter) {
      return letter.toUpperCase();
    });
}

function displayError(...args) {
  const color = '\x1b[31m'; // red
  const reset = '\x1b[0m'; // reset color
  console.error(color, '>>> Error:', reset, ...args);
}

// Thank you https://developer.mozilla.org.
function getRandom(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function logError(error) {
  numErrors++;
  displayError(`>>> ${error}`);
  fs.appendFileSync(ERROR_LOG, `${error}\n\n`);
}

// Write an HTML file, validating first if requested.
function validateThenWrite(filepath, html) {
  if (!DO_VALIDATION) {
    writeFile(filepath, html);
    return;
  }
  const options = {
    data: html,
    format: 'text',
    ignore: VALIDATOR_IGNORE,
    validator: 'https://html5.validator.nu', // alternative
  };
  validator(options).then((data) => {
    if (data.includes('Error')) {
      displayError(`Validation error for ${filepath}`, data);
    } else {
      console.log(`Validated \x1b[97m${filepath}\x1b[0m`);
      writeFile(filepath, html);
    }
  }).catch((error) => {
    displayError(`Error validating ${filepath}`, error);
  });
}

function writeFile(filepath, data) {
  try {
    fsPromises.writeFile(filepath, data);
    console.log(`Created \x1b[97m${filepath}\x1b[0m`);
  } catch (error) {
    displayError(`Error writing ${filepath}:`, error);
  }
}

// Check if all transcript HTML files have been written.
// async function checkIfComplete() {
// try {
//   let filenames = await fsPromises.readdir(APP_TRANSCRIPTS_DIR);
//   console.log('>>>', filenames.length);
//   filenames = filenames.filter((filename) => {
//     filename.match(/.+\.html$/);
//   });
// } catch (error) {
//   displayError('Error checking ${APP_TRANSCRIPTS_DIR}', error);
// }
// }

