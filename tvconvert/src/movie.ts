import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { OutputFileType } from "./outputFileTypes";
import { question } from "./utils";

interface Stream {
  index: number;
  codec_name: string;
  language: string | undefined;
  title: string | undefined;
}

interface AudioStream extends Stream {
  channels: number;
}

interface SubtitleStream extends Stream {}

interface ContainerInfo {
  audioStreams: readonly AudioStream[];
  subtitleStreams: readonly SubtitleStream[];
}

export interface IMovie {
  title: string;
  year: number;
  inputFilePath: string;
}

export class Movie implements IMovie {
  private containerDurationSeconds: number | undefined;
  private selectedAudioStream: AudioStream | undefined;
  private selectedSubtitleStream: SubtitleStream | null | undefined;

  private conversionSuccessful: boolean | undefined;
  private stderr: string | undefined;

  public static fromIMovie(movie: IMovie): Movie {
    return new Movie(movie.title, movie.year, movie.inputFilePath);
  }

  private constructor(
    public readonly title: string,
    public readonly year: number,
    public readonly inputFilePath: string
  ) {}

  public getFullyQualifiedName(fileNameSafe: boolean): string {
    let title = fileNameSafe
      ? this.title.replace(/[^a-zA-Z0-9-_ ]/g, "")
      : this.title;
    const fullyQualifiedName = `${title} (${this.year})`;
    return fullyQualifiedName;
  }

  public hasValidInputFilePath(): boolean {
    return (
      typeof this.inputFilePath === "string" && existsSync(this.inputFilePath)
    );
  }

  public hasValidTitle(): boolean {
    return typeof this.title === "string" && this.title.length > 0;
  }

  public hasValidYear(): boolean {
    return (
      typeof this.year === "number" && this.year >= 1888 && this.year <= 2023
    );
  }

  public async gatherConversionInfo(ffprobeBinaryPath: string): Promise<void> {
    console.log(`Gathering info for: ${this.getFullyQualifiedName(false)}…`);

    const { audioStreams, subtitleStreams } = this.getInputFileMediaInfo(
      this.inputFilePath,
      ffprobeBinaryPath
    );
    await this.selectAudioStream(audioStreams);
    await this.selectSubtitleStream(subtitleStreams);
  }

  public async convert(
    outputFolderPath: string,
    ffmpegBinaryPath: string,
    currentFileIndex: number,
    allFilesCount: number
  ): Promise<void> {
    if (!this.canConvert()) {
      throw new Error(
        "AssertError: must call gatherConversionInfo() before convert()"
      );
    }

    const globalArguments = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-progress",
      "pipe:1",
      "-y",
    ];

    const inputFileArguments = ["-i", this.inputFilePath];

    const outputsArguments = [
      this.getMkvOutputArguments(outputFolderPath),
      this.getSrtOutputArguments(outputFolderPath),
    ];

    const ffmpegArguments = [
      ...globalArguments,
      ...inputFileArguments,
      ...outputsArguments.flat(),
    ];

    mkdirSync(this.getOutputSubfolderPath(outputFolderPath), {
      recursive: true,
    });

    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegBinaryPath, ffmpegArguments);
      ffmpeg.stdout.setEncoding("utf8");

      const getProgressPercentageRounded = (normalizedProgress: number) =>
        (normalizedProgress * 100).toFixed(2);

      let progressPercentageRounded = getProgressPercentageRounded(0);
      ffmpeg.stdout.on("data", (data) => {
        const outTimeMicroseconds = data.match(/out_time_us=(.+)\n/)[1];
        const speed = data.match(/speed=(.+)\n/)[1];

        if (outTimeMicroseconds === "N/A" || speed === "N/A") {
          return;
        }

        const outTimeSeconds = outTimeMicroseconds / 1e6;
        const progress = outTimeSeconds / this.containerDurationSeconds!;
        const newProgressPercentageRounded =
          getProgressPercentageRounded(progress);
        if (newProgressPercentageRounded !== progressPercentageRounded) {
          progressPercentageRounded = newProgressPercentageRounded;
          this.logProgress(
            currentFileIndex,
            allFilesCount,
            progressPercentageRounded,
            speed
          );
        }
      });

      let stderr = "";
      ffmpeg.stderr.setEncoding("utf8");
      ffmpeg.stderr.on("data", (data) => {
        stderr += data;
      });

      ffmpeg.on("close", (exitCode) => {
        this.conversionSuccessful = exitCode === 0;
        this.stderr = stderr;
        resolve();
      });
    });
  }

  public isConversionSuccessful(): boolean {
    if (this.conversionSuccessful === undefined) {
      throw new Error("AssertError: conversion didn't finish yet");
    }
    return this.conversionSuccessful;
  }

  public getStderr(): string {
    if (this.stderr === undefined) {
      throw new Error("AssertError: conversion didn't finish yet");
    }
    return this.stderr;
  }

  private getOutputFilePath(
    outputFolderPath: string,
    outputFileType: OutputFileType,
    srtLanguageCode?: string | undefined
  ): string {
    if (outputFileType !== "srt" && srtLanguageCode !== undefined) {
      throw new Error(
        "AssertError: srtLanguageCode can only be provided when outputFileType === 'srt'"
      );
    }
    const outputSubfolderPath = this.getOutputSubfolderPath(outputFolderPath);
    let outputFileName = `${this.getFullyQualifiedName(true)}`;
    if (srtLanguageCode !== undefined) {
      outputFileName += `.${srtLanguageCode}`;
    }
    outputFileName += `.${outputFileType}`;
    return join(outputSubfolderPath, outputFileName);
  }

  private getOutputSubfolderPath(outputFolderPath: string): string {
    const outputSubfolderName = this.isExternalSubtitleNeeded()
      ? "external_subtitle_needed"
      : "ready";
    return join(
      outputFolderPath,
      outputSubfolderName,
      this.getFullyQualifiedName(true)
    );
  }

  private isExternalSubtitleNeeded(): boolean {
    return this.selectedSubtitleStream === null;
  }

  private getInputFileMediaInfo(
    inputFilePath: string,
    ffprobeBinary: string
  ): ContainerInfo {
    const { stdout } = spawnSync(
      ffprobeBinary,
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

    this.containerDurationSeconds = format.duration;

    const audioStreams: AudioStream[] = streams
      .filter((s: any) => s.codec_type === "audio")
      .map((s: any) => ({
        index: s.index,
        codec_name: s.codec_name,
        channels: s.channels,
        language: s.tags?.language,
        title: s.tags?.title,
      }));

    const subtitleStreams: SubtitleStream[] = streams
      .filter((s: any) => s.codec_type === "subtitle")
      .map((s: any) => ({
        index: s.index,
        codec_name: s.codec_name,
        language: s.tags?.language,
        title: s.tags?.title,
      }));

    return { audioStreams, subtitleStreams };
  }

  private async selectAudioStream(
    audioStreams: readonly AudioStream[]
  ): Promise<void> {
    console.table(
      audioStreams.map((stream) => ({
        Index: stream.index,
        Language: stream.language,
        Codec: stream.codec_name,
        Channels: stream.channels,
        Title: stream.title,
      }))
    );

    do {
      const audioStreamSelectionAnswer = await question(
        "Select audio stream index: "
      );
      const audioStreamIndexCandidate = Number.parseInt(
        audioStreamSelectionAnswer,
        10
      );
      this.selectedAudioStream = audioStreams.find(
        (audioStream) => audioStream.index === audioStreamIndexCandidate
      );
    } while (this.selectedAudioStream === undefined);
  }

  private async selectSubtitleStream(
    subtitleStreams: readonly SubtitleStream[]
  ): Promise<void> {
    console.table(
      subtitleStreams
        .filter((s) => s.codec_name === "subrip")
        .map((stream) => ({
          Index: stream.index,
          Language: stream.language,
          Title: stream.title,
        }))
    );

    do {
      const subtitleStreamSelectionAnswer = await question(
        "Select subtitle stream index (leave empty if using external subtitles): "
      );
      if (subtitleStreamSelectionAnswer === "") {
        this.selectedSubtitleStream = null;
        break;
      }
      const subtitleStreamIndexCandidate = Number.parseInt(
        subtitleStreamSelectionAnswer,
        10
      );
      this.selectedSubtitleStream = subtitleStreams.find(
        (subtitleStream) =>
          subtitleStream.index === subtitleStreamIndexCandidate
      );
    } while (this.selectedSubtitleStream === undefined);
  }

  private canConvert(): boolean {
    return [
      this.containerDurationSeconds,
      this.selectedAudioStream,
      this.selectedSubtitleStream,
    ].every((v) => v !== undefined);
  }

  private getMkvOutputArguments(outputFolderPath: string): string[] {
    const mkvOutputArguments = [];

    // copy video streams
    mkvOutputArguments.push("-map", "0:v", "-codec:v", "copy");

    // map the selected input audio stream to the first and default output audio stream
    // downmix to 2.0, transcode to AAC (48kHz, 256kbps), and apply the loudnorm filter with lra = 10
    mkvOutputArguments.push(
      "-map",
      `0:${this.selectedAudioStream!.index}`,
      "-codec:a:0",
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

    // map all (the first 100, if they exist) original audio streams shifted by plus one
    for (
      let iAudioInputStream = 0, iAudioOutputStream = 1;
      iAudioInputStream < 100;
      iAudioInputStream++, iAudioOutputStream++
    ) {
      mkvOutputArguments.push(
        "-map",
        `0:a:${iAudioInputStream}?`,
        `-codec:a:${iAudioOutputStream}`,
        "copy",
        `-disposition:a:${iAudioOutputStream}`,
        "0"
      );
    }

    // map all original subtitle streams
    mkvOutputArguments.push("-map", "0:s?", "-codec:s", "copy");

    mkvOutputArguments.push(this.getOutputFilePath(outputFolderPath, "mkv"));

    return mkvOutputArguments;
  }

  private getSrtOutputArguments(outputFolderPath: string): string[] {
    // do not produce an srt output if there is no selected subtitle stream
    if (this.selectedSubtitleStream === null) {
      return [];
    }

    return [
      "-map",
      `0:${this.selectedSubtitleStream!.index}`,
      this.getOutputFilePath(
        outputFolderPath,
        "srt",
        this.selectedSubtitleStream?.language
      ),
    ];
  }

  private logProgress(
    currentFileIndex: number,
    allFilesCount: number,
    progressPercentageRounded: string,
    speed: number
  ) {
    console.log(
      `[${currentFileIndex} / ${allFilesCount}] ${this.getFullyQualifiedName(
        false
      )} [${progressPercentageRounded}% at ${speed}]`
    );
  }
}
