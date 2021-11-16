import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { createInterface } from "readline";

const EXAMPLE_CONFIG = {
  ffmpeg_binary: "/usr/local/bin/ffmpeg",
  ffprobe_binary: "/usr/local/bin/ffprobe",
  inputs: ["downloaded/The Matrix/The Matrix.mkv"],
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

function validateConfig(config) {
  if (!existsSync(config.ffmpeg_binary)) {
    throw new Error("config.ffmpeg_binary is missing of doesn't exist");
  }

  if (!existsSync(config.ffprobe_binary)) {
    throw new Error("config.ffprobe_binary is missing or doesn't exist");
  }

  if (!Array.isArray(config.inputs)) {
    throw new Error("config.inputs is missing or not an array");
  }

  const nonExistingInputs = config.inputs.filter((i) => !existsSync(i));
  if (nonExistingInputs.length > 0) {
    throw new Error(
      `The following inputs do not exist:\n${nonExistingInputs.join("\n")}`
    );
  }

  if (!existsSync(config.outputFolderPath)) {
    throw new Error("config.outputFolderPath does not exist");
  }

  const alreadyExistingOutputs = config.inputs.filter((i) =>
    existsSync(join(config.outputFolderPath, basename(i)))
  );
  if (alreadyExistingOutputs.length > 0) {
    throw new Error(
      `The following outputs already exist:\n${alreadyExistingOutputs.join(
        "\n"
      )}`
    );
  }
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

function getStreamsInfo(inputFilePath, ffprobe_binary) {
  const { stdout } = spawnSync(
    ffprobe_binary,
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
    subtitleStreamIndex = await question(
      "Select subtitle stream index (leave empty for external file): "
    );
  } while (
    !(
      subtitleStreams
        .map((s) => s.index)
        .includes(parseInt(subtitleStreamIndex, 10)) ||
      subtitleStreamIndex === ""
    )
  );

  return subtitleStreamIndex;
}

function getContainerDurationSeconds(inputFilePath, ffprobe_binary) {
  const { stdout } = spawnSync(
    ffprobe_binary,
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
  allFilesCount,
  ffprobe_binary,
  ffmpeg_binary
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

  const containerDurationSeconds = getContainerDurationSeconds(
    inputFilePath,
    ffprobe_binary
  );

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

    // map the selected input audio stream to the first and default output audio stream
    // transcode to 2.0 AAC (48kHz, 256kbps) and apply the loudnorm filter with lra = 10
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
    "-filter:a:0",
    "loudnorm=lra=10",
    "-metadata:s:a:0",
    'title="English 2.0 AAC normalized"',
    "-metadata:s:a:0",
    "language=eng",
    "-disposition:a:0",
    "default",

    // map all original audio streams shifted by plus one
    "-map",
    "0:a:0?",
    "-c:a:1",
    "copy",
    "-disposition:a:1",
    "0",

    "-map",
    "0:a:1?",
    "-c:a:2",
    "copy",
    "-disposition:a:2",
    "0",

    "-map",
    "0:a:2?",
    "-c:a:3",
    "copy",
    "-disposition:a:3",
    "0",

    "-map",
    "0:a:3?",
    "-c:a:4",
    "copy",
    "-disposition:a:4",
    "0",

    "-map",
    "0:a:4?",
    "-c:a:5",
    "copy",
    "-disposition:a:5",
    "0",

    "-map",
    "0:a:5?",
    "-c:a:6",
    "copy",
    "-disposition:a:6",
    "0",

    "-map",
    "0:a:6?",
    "-c:a:7",
    "copy",
    "-disposition:a:7",
    "0",

    "-map",
    "0:a:7?",
    "-c:a:8",
    "copy",
    "-disposition:a:8",
    "0",

    "-map",
    "0:a:8?",
    "-c:a:9",
    "copy",
    "-disposition:a:9",
    "0",

    "-map",
    "0:a:9?",
    "-c:a:10",
    "copy",
    "-disposition:a:10",
    "0",

    // if there is a selected subtitle stream,
    //   map the selected input subtitle stream to the first and default output subtitle stream,
    //   and map all original subtitle streams shifted by plus one
    // else map all original subtitle streams
    ...(subtitleStreamIndex !== ""
      ? [
          "-map",
          `0:${subtitleStreamIndex}`,
          "-c:s:0",
          "copy",
          "-disposition:s:0",
          "default",

          "-map",
          "0:s:0?",
          "-c:s:1",
          "copy",
          "-disposition:s:1",
          "0",

          "-map",
          "0:s:1?",
          "-c:s:2",
          "copy",
          "-disposition:s:2",
          "0",

          "-map",
          "0:s:2?",
          "-c:s:3",
          "copy",
          "-disposition:s:3",
          "0",

          "-map",
          "0:s:3?",
          "-c:s:4",
          "copy",
          "-disposition:s:4",
          "0",

          "-map",
          "0:s:4?",
          "-c:s:5",
          "copy",
          "-disposition:s:5",
          "0",

          "-map",
          "0:s:5?",
          "-c:s:6",
          "copy",
          "-disposition:s:6",
          "0",

          "-map",
          "0:s:6?",
          "-c:s:7",
          "copy",
          "-disposition:s:7",
          "0",

          "-map",
          "0:s:7?",
          "-c:s:8",
          "copy",
          "-disposition:s:8",
          "0",

          "-map",
          "0:s:8?",
          "-c:s:9",
          "copy",
          "-disposition:s:9",
          "0",

          "-map",
          "0:s:9?",
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
    const ffmpeg = spawn(ffmpeg_binary, ffmpegArguments);

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

  try {
    validateConfig(config);
  } catch (ex) {
    console.error(ex.message);
    process.exit(1);
  }

  config.inputs = config.inputs.map((i) => ({ inputFilePath: i }));

  const outputFolderPath = config.outputFolderPath;

  for (const input of config.inputs) {
    input.outputFilePath = join(
      outputFolderPath,
      basename(input.inputFilePath)
    );
  }

  const additionalSubtitlesNeeded = [];

  for (const input of config.inputs) {
    console.log(`Source: ${input.inputFilePath}`);

    const { audioStreams, subtitleStreams } = getStreamsInfo(
      input.inputFilePath,
      config.ffprobe_binary
    );

    input.audioStreamIndex = await selectAudioStream(audioStreams);
    input.subtitleStreamIndex = await selectSubtitleStream(subtitleStreams);

    if (input.subtitleStreamIndex === "") {
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
      config.inputs.length,
      config.ffprobe_binary,
      config.ffmpeg_binary
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
