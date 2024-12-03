// Function to get system special folder paths
async function getSystemPath(fileType) {
  const username = (await chrome.runtime.getPlatformInfo()).username;
  const basePath = "C:/Users/" + username + "/Downloads";

  return basePath;
}

const fileTypeMap = {
  // Images
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  tiff: "image",
  bmp: "image",
  ico: "image",
  raw: "image",
  heic: "image",

  // Documents
  pdf: "document",
  doc: "document",
  docx: "document",
  txt: "document",
  xlsx: "document",
  csv: "document",
  xls: "document",
  ppt: "document",
  pptx: "document",
  odt: "document",
  rtf: "document",
  tex: "document",
  wpd: "document",
  md: "document",
  epub: "document",
  mobi: "document",

  // Videos
  mp4: "video",
  mkv: "video",
  avi: "video",
  mov: "video",
  wmv: "video",
  flv: "video",
  webm: "video",
  m4v: "video",
  "3gp": "video",
  mpeg: "video",
  mpg: "video",

  // Audio
  mp3: "music",
  wav: "music",
  m4a: "music",
  flac: "music",
  aac: "music",
  ogg: "music",
  wma: "music",
  aiff: "music",
  opus: "music",
  mid: "music",
  midi: "music",

  // Archives
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  bz2: "archive",
  xz: "archive",
  tgz: "archive",
  cab: "archive",

  // Executables and Installers
  exe: "executable",
  msi: "executable",
  dmg: "executable",
  app: "executable",
  deb: "executable",
  rpm: "executable",
  iso: "executable",
  pkg: "executable",
  apk: "executable",

  // Add Web Files
  html: "web",
  htm: "web",
  css: "web",
  js: "web",
  json: "web",
  xml: "web",
};

// Add MIME type mapping
const mimeTypeMap = {
  // Images
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "image/tiff": "image",
  "image/bmp": "image",
  "image/x-icon": "image",
  "image/heic": "image",

  // Documents
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "document",
  "text/plain": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "document",
  "application/vnd.oasis.opendocument.text": "document",
  "application/rtf": "document",
  "text/markdown": "document",
  "application/epub+zip": "document",

  // Videos
  "video/mp4": "video",
  "video/x-matroska": "video",
  "video/x-msvideo": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "video/3gpp": "video",
  "video/mpeg": "video",

  // Audio
  "audio/mpeg": "music",
  "audio/wav": "music",
  "audio/ogg": "music",
  "audio/flac": "music",
  "audio/aac": "music",
  "audio/midi": "music",
  "audio/webm": "music",

  // Archives
  "application/zip": "archive",
  "application/x-rar-compressed": "archive",
  "application/x-7z-compressed": "archive",
  "application/x-tar": "archive",
  "application/gzip": "archive",
  "application/x-bzip2": "archive",
  "application/x-compressed": "archive",

  // Executables
  "application/x-msdownload": "executable",
  "application/x-msi": "executable",
  "application/x-apple-diskimage": "executable",
  "application/vnd.debian.binary-package": "executable",
  "application/x-rpm": "executable",
  "application/vnd.android.package-archive": "executable",

  // Add Web MIME types
  "text/html": "web",
  "text/css": "web",
  "text/javascript": "web",
  "application/javascript": "web",
  "application/json": "web",
  "application/xml": "web",
  "text/xml": "web",
};

// Function to determine file type using both MIME type and extension
function determineFileType(mimeType, fileExtension) {
  // First check for HTML files specifically
  if (
    mimeType === "text/html" ||
    fileExtension === "html" ||
    fileExtension === "htm"
  ) {
    return "web";
  }

  // Then try to determine by MIME type
  if (mimeTypeMap[mimeType]) {
    return mimeTypeMap[mimeType];
  }

  // Fall back to extension if MIME type is not recognized
  if (fileTypeMap[fileExtension]) {
    return fileTypeMap[fileExtension];
  }

  // Return default type if neither is recognized
  return "unknown";
}

// Update the listener to handle all file types properly
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  let fileName = downloadItem.filename;

  // Remove .crdownload extension if present
  if (fileName.endsWith(".crdownload")) {
    fileName = fileName.slice(0, -10);
  }

  const fileExtension = fileName.split(".").pop().toLowerCase();
  const mimeType = downloadItem.mime;
  const fileType = determineFileType(mimeType, fileExtension);

  if (fileType !== "unknown") {
    getSystemPath(fileType).then((basePath) => {
      let newPath;

      // Create appropriate path based on file type
      switch (fileType) {
        case "executable":
          newPath = `Software/${fileExtension}/${fileName}`;
          break;
        case "archive":
          newPath = `Archives/${fileExtension}/${fileName}`;
          break;
        case "web":
          newPath = `Web/html/${fileName}`;
          break;
        case "document":
          newPath = `Documents/${fileExtension}/${fileName}`;
          break;
        case "video":
          newPath = `Videos/${fileExtension}/${fileName}`;
          break;
        case "image":
          newPath = `Pictures/${fileExtension}/${fileName}`;
          break;
        case "music":
          newPath = `Music/${fileExtension}/${fileName}`;
          break;
        default:
          newPath = `Others/${fileName}`;
      }

      console.log("File type:", fileType);
      console.log("MIME type:", mimeType);
      console.log("Extension:", fileExtension);
      console.log("Redirecting download to:", basePath + "/" + newPath);

      suggest({
        filename: newPath,
        conflict_action: "uniquify",
      });
    });
  } else {
    // For unknown file types, save to Downloads/Others
    getSystemPath("default").then((basePath) => {
      const newPath = `Others/${fileName}`;
      console.log("Unknown file type, saving to:", basePath + "/" + newPath);
      suggest({
        filename: newPath,
        conflict_action: "uniquify",
      });
    });
  }

  return true;
});

// Handle completed downloads
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === "complete") {
    console.log("Download completed:", delta.id);
  }
});
