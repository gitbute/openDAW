export const CodeCellImageHint =
    "From a code cell the result is one string: the JSON text, then one data:image URL per line. " +
    "Never pass it to text() whole; show it with: for (const line of String(result).split(\"\\n\")) " +
    "line.startsWith(\"data:image\") ? image(line) : text(line)"
