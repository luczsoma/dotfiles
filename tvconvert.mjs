import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { createInterface } from "readline";

const FFPROBE_BINARY = "/usr/local/ffmpeg/bin/ffprobe";
const FFMPEG_BINARY = "/usr/local/ffmpeg/bin/ffmpeg";

const EXAMPLE_CONFIG = {
  inputs: [
    {
      inputFilePath: "downloaded/The Matrix/The Matrix.mkv",
    },
  ],
  outputFolderPath: "converted",
};

function printHelp() {
  console.log("Read input files and available data from config.json:");
  console.log("  tvconvert.sh -c {configfile}.json");
  console.log("  tvconvert.sh --config {configfile}.json");
  console.log("Print config file skeleton into file:");
  console.log("  tvconvert.sh -p {configfile}.json");
  console.log("  tvconvert.sh --print-config {configfile}.json");
}

function question(question) {
  const readLineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readLineInterface.question(question, (answer) => {
      resolve(answer);
      readLineInterface.close();
    });
  });
}

function getStreamsInfo(inputFilePath) {
  const { stdout } = spawnSync(
    FFPROBE_BINARY,
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-show_streams",
      "-print_format",
      "json",
      inputFilePath,
    ],
    {
      encoding: "utf8",
    }
  );

  const streams = JSON.parse(stdout).streams;

  const audioStreams = streams
    .filter((s) => s.codec_type === "audio")
    .map((s) => ({
      index: s.index,
      codec_name: s.codec_name,
      channels: s.channels,
      language: s.tags && s.tags.language,
      title: s.tags && s.tags.title,
    }));

  const subtitleStreams = streams
    .filter((s) => s.codec_type === "subtitle")
    .map((s) => ({
      index: s.index,
      codec_name: s.codec_name,
      language: s.tags && s.tags.language,
      title: s.tags && s.tags.title,
    }));

  return { audioStreams, subtitleStreams };
}

async function selectAudioStream(audioStreams) {
  console.log(audioStreams);

  let audioStreamIndex;
  do {
    audioStreamIndex = await question("Select audio stream index: ");
  } while (
    !audioStreams.map((s) => s.index).includes(parseInt(audioStreamIndex, 10))
  );

  return audioStreamIndex;
}

async function selectSubtitleStream(subtitleStreams) {
  console.log(subtitleStreams.filter((s) => s.codec_name === "subrip"));

  let subtitleStreamIndex;
  do {
    subtitleStreamIndex = await question("Select subtitle stream index: ");
  } while (
    !subtitleStreams
      .map((s) => s.index)
      .includes(parseInt(subtitleStreamIndex, 10))
  );

  return subtitleStreamIndex;
}

function mkdirpForOutputFile(outputFilePath) {
  spawnSync("mkdir", ["-p", dirname(outputFilePath)]);
}

function getContainerDurationSeconds(inputFilePath) {
  const { stdout } = spawnSync(
    FFPROBE_BINARY,
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-show_entries",
      "format",
      "-print_format",
      "json",
      inputFilePath,
    ],
    {
      encoding: "utf8",
    }
  );
  return JSON.parse(stdout).format.duration;
}

function logProgress(
  currentFileIndex,
  allFilesCount,
  inputFilePath,
  progressPercentageRounded,
  speed
) {
  console.log(
    `[${currentFileIndex} / ${allFilesCount}] ${inputFilePath} [${progressPercentageRounded}% at ${speed}]`
  );
}

async function convert(
  inputFilePath,
  outputFilePath,
  audioStreamIndex,
  subtitleStreamIndex,
  currentFileIndex,
  allFilesCount
) {
  console.log();
  console.log(
    "========================================================================"
  );
  console.log(`Converting ${currentFileIndex} / ${allFilesCount}`);
  console.log(`Source: ${inputFilePath}`);
  console.log(`Destination: ${outputFilePath}`);
  console.log(
    "========================================================================"
  );

  const containerDurationSeconds = getContainerDurationSeconds(inputFilePath);
  mkdirpForOutputFile(outputFilePath);

  const globalArguments = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-progress",
    "pipe:1",
    "-y",
  ];

  const inputFileArguments = ["-i", inputFilePath];

  const outputFileArguments = [
    // copy video streams
    "-map",
    "0:v",
    "-c:v",
    "copy",

    // // map the selected input audio stream to the first and default output audio stream
    // // transcode to 2.0 AAC (48kHz, 256kbps) and apply the following filters:
    // //   - loudnorm
    // //   - acompressor (ratio = 4)
    // "-map",
    // `0:${audioStreamIndex}`,
    // "-c:a:0",
    // "aac",
    // "-ar:a:0",
    // "48000",
    // "-b:a:0",
    // "256k",
    // "-ac:a:0",
    // "2",
    // "-filter:a:0",
    // "acompressor=ratio=4,loudnorm",
    // "-metadata:s:a:0",
    // 'title="English 2.0 AAC (normalized and compressed)"',
    // "-metadata:s:a:0",
    // "language=eng",
    // "-disposition:a:0",
    // "default",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:0",
    "aac",
    "-ar:a:0",
    "48000",
    "-b:a:0",
    "256k",
    "-ac:a:0",
    "2",
    "-metadata:s:a:0",
    'title="English 2.0 AAC"',
    "-metadata:s:a:0",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:1",
    "aac",
    "-ar:a:1",
    "48000",
    "-b:a:1",
    "256k",
    "-ac:a:1",
    "2",
    "-filter:a:1",
    "loudnorm",
    "-metadata:s:a:1",
    'title="English 2.0 AAC (loudnorm)"',
    "-metadata:s:a:1",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:2",
    "aac",
    "-ar:a:2",
    "48000",
    "-b:a:2",
    "256k",
    "-ac:a:2",
    "2",
    "-filter:a:2",
    "acompressor",
    "-metadata:s:a:2",
    'title="English 2.0 AAC (acompressor=ratio=2)"',
    "-metadata:s:a:2",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:3",
    "aac",
    "-ar:a:3",
    "48000",
    "-b:a:3",
    "256k",
    "-ac:a:3",
    "2",
    "-filter:a:3",
    "acompressor=ratio=4",
    "-metadata:s:a:3",
    'title="English 2.0 AAC (acompressor=ratio=4)"',
    "-metadata:s:a:3",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:4",
    "aac",
    "-ar:a:4",
    "48000",
    "-b:a:4",
    "256k",
    "-ac:a:4",
    "2",
    "-filter:a:4",
    "acompressor=ratio=2,loudnorm",
    "-metadata:s:a:4",
    'title="English 2.0 AAC (acompressor=ratio=2,loudnorm)"',
    "-metadata:s:a:4",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:5",
    "aac",
    "-ar:a:5",
    "48000",
    "-b:a:5",
    "256k",
    "-ac:a:5",
    "2",
    "-filter:a:5",
    "acompressor=ratio=4,loudnorm",
    "-metadata:s:a:5",
    'title="English 2.0 AAC (acompressor=ratio=4,loudnorm)"',
    "-metadata:s:a:5",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:6",
    "aac",
    "-ar:a:6",
    "48000",
    "-b:a:6",
    "256k",
    "-ac:a:6",
    "2",
    "-filter:a:6",
    "loudnorm,acompressor=ratio=2",
    "-metadata:s:a:6",
    'title="English 2.0 AAC (loudnorm,acompressor=ratio=2)"',
    "-metadata:s:a:6",
    "language=eng",

    "-map",
    `0:${audioStreamIndex}`,
    "-c:a:7",
    "aac",
    "-ar:a:7",
    "48000",
    "-b:a:7",
    "256k",
    "-ac:a:7",
    "2",
    "-filter:a:7",
    "loudnorm,acompressor=ratio=4",
    "-metadata:s:a:7",
    'title="English 2.0 AAC (loudnorm,acompressor=ratio=4)"',
    "-metadata:s:a:7",
    "language=eng",

    // // map all original audio streams shifted by plus one
    // "-map",
    // "0:a:0?",
    // "-c:a:1",
    // "copy",
    // "-disposition:a:1",
    // "0",

    // "-map",
    // "0:a:1?",
    // "-c:a:2",
    // "copy",
    // "-disposition:a:2",
    // "0",

    // "-map",
    // "0:a:2?",
    // "-c:a:3",
    // "copy",
    // "-disposition:a:3",
    // "0",

    // "-map",
    // "0:a:3?",
    // "-c:a:4",
    // "copy",
    // "-disposition:a:4",
    // "0",

    // "-map",
    // "0:a:4?",
    // "-c:a:5",
    // "copy",
    // "-disposition:a:5",
    // "0",

    // "-map",
    // "0:a:5?",
    // "-c:a:6",
    // "copy",
    // "-disposition:a:6",
    // "0",

    // "-map",
    // "0:a:6?",
    // "-c:a:7",
    // "copy",
    // "-disposition:a:7",
    // "0",

    // "-map",
    // "0:a:7?",
    // "-c:a:8",
    // "copy",
    // "-disposition:a:8",
    // "0",

    // "-map",
    // "0:a:8?",
    // "-c:a:9",
    // "copy",
    // "-disposition:a:9",
    // "0",

    // "-map",
    // "0:a:9?",
    // "-c:a:10",
    // "copy",
    // "-disposition:a:10",
    // "0",

    // if there is a selected subtitle stream,
    //   map the selected input subtitle stream to the first and default output subtitle stream,
    //   and map all original subtitle streams shifted by plus one
    // else map all original subtitle streams
    ...(subtitleStreamIndex !== undefined
      ? [
          "-map",
          `0:${subtitleStreamIndex}`,
          "-c:s:0",
          "copy",
          "-disposition:s:0",
          "default",

          "-map",
          "0:a:0?",
          "-c:s:1",
          "copy",
          "-disposition:s:1",
          "0",

          "-map",
          "0:a:1?",
          "-c:s:2",
          "copy",
          "-disposition:s:2",
          "0",

          "-map",
          "0:a:2?",
          "-c:s:3",
          "copy",
          "-disposition:s:3",
          "0",

          "-map",
          "0:a:3?",
          "-c:s:4",
          "copy",
          "-disposition:s:4",
          "0",

          "-map",
          "0:a:4?",
          "-c:s:5",
          "copy",
          "-disposition:s:5",
          "0",

          "-map",
          "0:a:5?",
          "-c:s:6",
          "copy",
          "-disposition:s:6",
          "0",

          "-map",
          "0:a:6?",
          "-c:s:7",
          "copy",
          "-disposition:s:7",
          "0",

          "-map",
          "0:a:7?",
          "-c:s:8",
          "copy",
          "-disposition:s:8",
          "0",

          "-map",
          "0:a:8?",
          "-c:s:9",
          "copy",
          "-disposition:s:9",
          "0",

          "-map",
          "0:a:9?",
          "-c:s:10",
          "copy",
          "-disposition:s:10",
          "0",
        ]
      : ["-map", "0:s", "-c:s", "copy"]),

    outputFilePath,
  ];

  const ffmpegArguments = [
    ...globalArguments,
    ...inputFileArguments,
    ...outputFileArguments,
  ];

  return new Promise((resolve) => {
    const ffmpeg = spawn(FFMPEG_BINARY, ffmpegArguments);

    let progressPercentageRounded = 0;
    ffmpeg.stdout.setEncoding("utf8");
    ffmpeg.stdout.on("data", (data) => {
      const outTimeMicroseconds = data.match(/out_time_us=(\d+)\n/)[1];
      const speed = data.match(/speed=(.+)\n/)[1];

      const outTimeSeconds = outTimeMicroseconds / 1000000;
      const progress = outTimeSeconds / containerDurationSeconds;
      const newProgressPercentageRounded = (progress * 100).toFixed(2);
      if (newProgressPercentageRounded !== progressPercentageRounded) {
        progressPercentageRounded = newProgressPercentageRounded;
        logProgress(
          currentFileIndex,
          allFilesCount,
          inputFilePath,
          progressPercentageRounded,
          speed
        );
      }
    });

    let stderr = "";
    ffmpeg.stderr.setEncoding("utf8");
    ffmpeg.stderr.on("data", (data) => {
      stderr += data;
      console.log(data);
    });

    ffmpeg.on("close", (exitCode) => {
      resolve({ exitCode, stderr });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length === 0 ||
    args.length === 1 ||
    (args.length === 2 &&
      args[0] !== "-c" &&
      args[0] !== "--config" &&
      args[0] !== "-p" &&
      args[0] !== "--print-config" &&
      !args[1].endsWith(".json"))
  ) {
    printHelp();
    process.exit(1);
  }

  if (args[0] === "-p" || args[0] === "--print-config") {
    writeFileSync(args[1], `${JSON.stringify(EXAMPLE_CONFIG, null, 2)}\n`);
    process.exit(0);
  }

  const config = JSON.parse(readFileSync(args[1], { encoding: "utf8" }));

  const outputFolderPath = config.outputFolderPath;

  for (const input of config.inputs) {
    input.outputFilePath = join(
      outputFolderPath,
      basename(input.inputFilePath)
    );
  }

  const additionalSubtitlesNeeded = [];

  for (const input of config.inputs) {
    if (!existsSync(input.inputFilePath)) {
      console.error(`ERROR: ${input.inputFilePath} does not exist.`);
      process.exit(1);
    }

    console.log(`Source: ${input.inputFilePath}`);

    const { audioStreams, subtitleStreams } = getStreamsInfo(
      input.inputFilePath
    );

    input.audioStreamIndex = await selectAudioStream(audioStreams);
    input.subtitleStreamIndex = await selectSubtitleStream(subtitleStreams);

    if (input.subtitleStreamIndex === undefined) {
      additionalSubtitlesNeeded.push(input.inputFilePath);
    }
  }

  let currentFileIndex = 0;
  const errors = [];

  for (const input of config.inputs) {
    const { exitCode, stderr } = await convert(
      input.inputFilePath,
      input.outputFilePath,
      input.audioStreamIndex,
      input.subtitleStreamIndex,
      ++currentFileIndex,
      config.inputs.length
    );

    if (exitCode > 0) {
      errors.push({ inputFilePath: input.inputFilePath, stderr });
    }
  }

  if (errors.length === 0) {
    console.log("\nSUCCESS");
  } else {
    console.log(`\nFINISHED WITH ${errors.length} ERRORS:`);
    for (const { inputFilePath, stderr } of errors) {
      console.log(`\n${inputFilePath}\n${stderr}`);
    }
    process.exit(1);
  }

  if (additionalSubtitlesNeeded.length > 0) {
    console.log("\nADDITIONAL SUBTITLES NEEDED:");
    for (const inputFilePath of additionalSubtitlesNeeded) {
      console.log(inputFilePath);
    }
  }
}

main();
