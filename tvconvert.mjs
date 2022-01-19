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

function getContainerInfo(inputFilePath, ffprobe_binary) {
  const { stdout } = spawnSync(
    ffprobe_binary,
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-show_format",
      "-show_streams",
      "-print_format",
      "json",
      inputFilePath,
    ],
    {
      encoding: "utf8",
    }
  );

  const { format, streams } = JSON.parse(stdout);

  const containerDurationSeconds = format.duration;

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

  return { containerDurationSeconds, audioStreams, subtitleStreams };
}

async function selectAudioStream(audioStreams) {
  console.table(
    audioStreams.map((stream) => ({
      Index: stream.index,
      Language: stream.language,
      Codec: stream.codec_name,
      Channels: stream.channels,
      Title: stream.title,
    }))
  );

  let selectedAudioStreamIndexCandidate;
  do {
    selectedAudioStreamIndexCandidate = await question(
      "Select audio stream index: "
    );
  } while (
    !audioStreams
      .map((s) => s.index)
      .includes(Number.parseInt(selectedAudioStreamIndexCandidate, 10))
  );

  return Number.parseInt(selectedAudioStreamIndexCandidate, 10);
}

async function selectSubtitleStream(subtitleStreams) {
  console.table(
    subtitleStreams
      .filter((s) => s.codec_name === "subrip")
      .map((stream) => ({
        Index: stream.index,
        Language: stream.language,
        Title: stream.title,
      }))
  );

  let selectedSubtitleStreamIndexCandidate;
  do {
    selectedSubtitleStreamIndexCandidate = await question(
      "Select subtitle stream index (leave empty if using external subtitles): "
    );
  } while (
    !(
      subtitleStreams
        .map((s) => s.index)
        .includes(Number.parseInt(selectedSubtitleStreamIndexCandidate, 10)) ||
      selectedSubtitleStreamIndexCandidate === ""
    )
  );

  return selectedSubtitleStreamIndexCandidate !== ""
    ? Number.parseInt(selectedSubtitleStreamIndexCandidate, 10)
    : null;
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
  containerDurationSeconds,
  selectedAudioStreamIndex,
  selectedSubtitleStreamIndex,
  currentFileIndex,
  allFilesCount,
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

  const globalArguments = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-progress",
    "pipe:1",
    "-y",
  ];

  const inputFileArguments = ["-i", inputFilePath];

  const outputFileArguments = [];

  // copy video streams
  outputFileArguments.push("-map", "0:v", "-c:v", "copy");

  // map the selected input audio stream to the first and default output audio stream
  // downmix to 2.0, transcode to AAC (48kHz, 256kbps), and apply the loudnorm filter with lra = 10
  outputFileArguments.push(
    "-map",
    `0:${selectedAudioStreamIndex}`,
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
    "title=AAC 2.0 (normalized)",
    "-disposition:a:0",
    "default"
  );

  // map all original audio streams shifted by plus one
  for (
    let iAudioInputStream = 0, iAudioOutputStream = 1;
    iAudioInputStream < 100;
    iAudioInputStream++, iAudioOutputStream++
  ) {
    outputFileArguments.push(
      "-map",
      `0:a:${iAudioInputStream}?`,
      `-c:a:${iAudioOutputStream}`,
      "copy",
      `-disposition:a:${iAudioOutputStream}`,
      "0"
    );
  }

  // if there is a selected subtitle stream,
  //   map the selected input subtitle stream to the first and default output subtitle stream,
  //   then map all original subtitle streams shifted by plus one (except the selected one)
  // else map all original subtitle streams
  if (selectedSubtitleStreamIndex !== null) {
    outputFileArguments.push(
      "-map",
      `0:${selectedSubtitleStreamIndex}`,
      "-c:s:0",
      "copy",
      "-disposition:s:0",
      "default"
    );

    for (
      let iSubtitleInputStream = 0, iSubtitleOutputStream = 1;
      iSubtitleInputStream < 100;
      iSubtitleInputStream++, iSubtitleOutputStream++
    ) {
      if (iSubtitleInputStream === selectedSubtitleStreamIndex) {
        iSubtitleInputStream++;
      }

      outputFileArguments.push(
        "-map",
        `0:s:${iSubtitleInputStream}?`,
        `-c:s:${iSubtitleOutputStream}`,
        "copy",
        `-disposition:s:${iSubtitleOutputStream}`,
        "0"
      );
    }
  } else {
    outputFileArguments.push("-map", "0:s?", "-c:s", "copy");
  }

  outputFileArguments.push(outputFilePath);

  const ffmpegArguments = [
    ...globalArguments,
    ...inputFileArguments,
    ...outputFileArguments,
  ];

  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpeg_binary, ffmpegArguments);
    ffmpeg.stdout.setEncoding("utf8");

    const getProgressPercentageRounded = (normalizedProgress) =>
      (normalizedProgress * 100).toFixed(2);

    let progressPercentageRounded = getProgressPercentageRounded(0);
    ffmpeg.stdout.on("data", (data) => {
      const outTimeMicroseconds = data.match(/out_time_us=(\d+)\n/)[1];
      const speed = data.match(/speed=(.+)\n/)[1];

      const outTimeSeconds = outTimeMicroseconds / 1e6;
      const progress = outTimeSeconds / containerDurationSeconds;
      const newProgressPercentageRounded =
        getProgressPercentageRounded(progress);
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

    const { containerDurationSeconds, audioStreams, subtitleStreams } =
      getContainerInfo(input.inputFilePath, config.ffprobe_binary);

    input.containerDurationSeconds = containerDurationSeconds;
    input.selectedAudioStreamIndex = await selectAudioStream(audioStreams);
    input.selectedSubtitleStreamIndex = await selectSubtitleStream(
      subtitleStreams
    );

    if (input.selectedSubtitleStreamIndex === null) {
      additionalSubtitlesNeeded.push(input.outputFilePath);
    }
  }

  let currentFileIndex = 0;
  const errors = [];

  for (const input of config.inputs) {
    const { exitCode, stderr } = await convert(
      input.inputFilePath,
      input.outputFilePath,
      input.containerDurationSeconds,
      input.selectedAudioStreamIndex,
      input.selectedSubtitleStreamIndex,
      ++currentFileIndex,
      config.inputs.length,
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
