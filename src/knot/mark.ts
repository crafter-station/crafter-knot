import source from "./mark.svg?raw";

export const MARK_PATH = source.match(/ d="([^"]+)"/)?.[1] ?? "";
