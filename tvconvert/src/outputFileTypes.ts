export const outputFileTypes = ["mkv", "srt"] as const;
export type OutputFileType = (typeof outputFileTypes)[number];
