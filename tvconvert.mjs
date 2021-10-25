import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { createInterface } from "readline";

const FFPROBE_BINARY = "/usr/local/ffmpeg/bin/ffprobe";
const FFMPEG_BINARY = "/usr/local/ffmpeg/bin/ffmpeg";

const EXAMPLE_CONFIG = {
  movies: [
    {
      movieTitle: "The Matrix",
      year: 1999,
      inputFilePath: "downloaded/The Matrix/The Matrix.mkv",
    },
  ],
  tvShowEpisodes: [
    {
      showTitle: "Totally Spies!",
      season: 1,
      episode: 1,
      episodeTitle: "A Thing for Musicians",
      inputFilePath:
        "downloaded/Totally Spies Season 01/Totally Spies S01E01.mkv",
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

function ensureValidFileName(string) {
  return string.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "");
}

function getMovieIdentifyingTitle(title, year) {
  return `${title} (${year})`;
}

function getMovieOutputFilePath(title, year, outputFolderPath) {
  return join(
    outputFolderPath,
    ensureValidFileName(`${getMovieIdentifyingTitle(title, year)}.mkv`)
  );
}

function getPaddedSeasonOrEpisode(seasonOrEpisode) {
  return seasonOrEpisode.toString().padStart(2, "0");
}

function getTvShowEpisodeIdentifyingTitle(
  showTitle,
  season,
  episode,
  episodeTitle
) {
  return [
    showTitle,
    `S${getPaddedSeasonOrEpisode(season)}E${getPaddedSeasonOrEpisode(episode)}`,
    episodeTitle,
  ].join(" - ");
}

function getTvShowEpisodeOutputFilePath(
  showTitle,
  season,
  episode,
  episodeTitle,
  outputFolderPath
) {
  return join(
    outputFolderPath,
    ensureValidFileName(showTitle),
    ensureValidFileName(`Season ${getPaddedSeasonOrEpisode(season)}`),
    ensureValidFileName(
      `${getTvShowEpisodeIdentifyingTitle(
        showTitle,
        season,
        episode,
        episodeTitle
      )}.mkv`
    )
  );
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

  const videoStreams = streams
    .filter((s) => s.codec_type === "video")
    .map((s) => ({
      index: s.index,
      codec_name: s.codec_name,
      language: s.tags && s.tags.language,
      title: s.tags && s.tags.title,
    }));

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

  return { videoStreams, audioStreams, subtitleStreams };
}

async function selectVideoStream(videoStreams) {
  if (videoStreams.length === 1) {
    return videoStreams[0].index;
  }

  console.log(videoStreams);

  let videoStreamIndex;
  do {
    videoStreamIndex = await question("Select video stream index: ");
  } while (
    !videoStreams.map((s) => s.index).includes(parseInt(videoStreamIndex, 10))
  );

  return videoStreamIndex;
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
  console.log(subtitleStreams);

  let subtitleStreamIndex;
  do {
    subtitleStreamIndex = await question(
      "Select subtitle stream index (leave empty for external subtitle file): "
    );
  } while (
    !(
      subtitleStreams
        .map((s) => s.index)
        .includes(parseInt(subtitleStreamIndex, 10)) ||
      subtitleStreamIndex === ""
    )
  );

  let subtitleFilePath;
  if (!subtitleStreamIndex) {
    subtitleStreamIndex = 0;
    do {
      subtitleFilePath = await question("External subtitle file: ");
    } while (!existsSync(subtitleFilePath));
  }

  return { subtitleStreamIndex, subtitleFilePath };
}

async function selectInputStreams(inputFilePath) {
  const { videoStreams, audioStreams, subtitleStreams } =
    getStreamsInfo(inputFilePath);

  const videoStreamIndex = await selectVideoStream(videoStreams);
  const audioStreamIndex = await selectAudioStream(audioStreams);
  const { subtitleStreamIndex, subtitleFilePath } = await selectSubtitleStream(
    subtitleStreams
  );

  return {
    videoStreamIndex,
    audioStreamIndex,
    subtitleStreamIndex,
    subtitleFilePath,
  };
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
  identifyingTitle,
  progressPercentageRounded,
  speed
) {
  console.log(
    `[${currentFileIndex} / ${allFilesCount}] ${identifyingTitle} [${progressPercentageRounded}% at ${speed}]`
  );
}

async function convert(
  identifyingTitle,
  inputFilePath,
  outputFilePath,
  videoStreamIndex,
  audioStreamIndex,
  subtitleStreamIndex,
  subtitleFilePath,
  currentFileIndex,
  allFilesCount
) {
  console.log();
  console.log(
    "========================================================================"
  );
  console.log(`Converting ${currentFileIndex} / ${allFilesCount}`);
  console.log(identifyingTitle);
  console.log();
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
  if (subtitleFilePath) {
    inputFileArguments.push("-i", subtitleFilePath);
  }

  const outputFileArguments = [
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-map",
    `0:${videoStreamIndex}`,
    "-c:v:0",
    "copy",
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
    "title=English",
    "-metadata:s:a:0",
    "language=eng",
    "-map",
    `${subtitleFilePath ? 1 : 0}:${subtitleStreamIndex}`,
    "-c:s:0",
    "copy",
    "-metadata:s:s:0",
    'title="English"',
    "-metadata:s:s:0",
    "language=eng",
    "-disposition:s:0",
    "default",
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
          identifyingTitle,
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
      !args[1].endswith(".json"))
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

  for (const movie of config.movies) {
    movie.identifyingTitle = getMovieIdentifyingTitle(
      movie.movieTitle,
      movie.year
    );
    movie.outputFilePath = getMovieOutputFilePath(
      movie.movieTitle,
      movie.year,
      outputFolderPath
    );
  }

  for (const tvShowEpisode of config.tvShowEpisodes) {
    tvShowEpisode.identifyingTitle = getTvShowEpisodeIdentifyingTitle(
      tvShowEpisode.showTitle,
      tvShowEpisode.season,
      tvShowEpisode.episode,
      tvShowEpisode.episodeTitle
    );
    tvShowEpisode.outputFilePath = getTvShowEpisodeOutputFilePath(
      tvShowEpisode.showTitle,
      tvShowEpisode.season,
      tvShowEpisode.episode,
      tvShowEpisode.episodeTitle,
      outputFolderPath
    );
  }

  for (const input of [...config.movies, ...config.tvShowEpisodes]) {
    if (!existsSync(input.inputFilePath)) {
      console.error(`ERROR: ${input.inputFilePath} does not exist.`);
      process.exit(1);
    }

    const {
      videoStreamIndex,
      audioStreamIndex,
      subtitleStreamIndex,
      subtitleFilePath,
    } = await selectInputStreams(input.inputFilePath);

    input.videoStreamIndex = videoStreamIndex;
    input.audioStreamIndex = audioStreamIndex;
    input.subtitleStreamIndex = subtitleStreamIndex;
    input.subtitleFilePath = subtitleFilePath;
  }

  let currentFileIndex = 0;
  const errors = [];

  for (const input of [...config.movies, ...config.tvShowEpisodes]) {
    const { exitCode, stderr } = await convert(
      input.identifyingTitle,
      input.inputFilePath,
      input.outputFilePath,
      input.videoStreamIndex,
      input.audioStreamIndex,
      input.subtitleStreamIndex,
      input.subtitleFilePath,
      ++currentFileIndex,
      config.movies.length + config.tvShowEpisodes.length
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
}

main();
