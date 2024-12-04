let accessToken = null;

// Function to get OAuth token
async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// Function to list Drive folders
async function listDriveFolders() {
  const token = await getAuthToken();
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=mimeType="application/vnd.google-apps.folder"',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const data = await response.json();
  return data.files;
}

// Function to get file extension and handle Google Docs types
function getFileDetails(file) {
  // Handle Google Workspace files
  if (file.mimeType.includes('application/vnd.google-apps.')) {
    switch (file.mimeType) {
      case 'application/vnd.google-apps.document':
        return { extension: 'doc', category: 'Documents' };
      case 'application/vnd.google-apps.spreadsheet':
        return { extension: 'xlsx', category: 'Documents' };
      case 'application/vnd.google-apps.presentation':
        return { extension: 'ppt', category: 'Documents' };
      default:
        return { extension: 'gdoc', category: 'Documents' };
    }
  }

  // For regular files
  const fileName = file.name;
  const fileExtension = fileName.split('.').pop().toLowerCase();
  const category = determineFileCategory(file.mimeType, fileExtension);
  
  return { extension: fileExtension, category: category };
}

// Function to find existing folder by name and parent
async function findFolder(name, parentId, token) {
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json();
  return data.files?.[0] || null;
}

// Function to organize files in a folder
async function organizeFolder(folderId) {
  const token = await getAuthToken();
  const status = document.getElementById("status");
  updateStatus("Organizing files...", "loading");

  try {
    // Special query for root folder
    const query = folderId === "root" 
      ? "parents in 'root' and mimeType != 'application/vnd.google-apps.folder'"
      : `"${folderId}" in parents and mimeType != 'application/vnd.google-apps.folder'`;

    // Get all files
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,parents)&pageSize=1000`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const data = await response.json();
    const files = data.files;

    if (!files?.length) {
      updateStatus("No files found to organize!", "info");
      return;
    }

    // Group files by category and extension
    const fileGroups = {};
    for (const file of files) {
      const { extension, category } = getFileDetails(file);
      if (!fileGroups[category]) fileGroups[category] = {};
      if (!fileGroups[category][extension]) fileGroups[category][extension] = [];
      fileGroups[category][extension].push(file);
    }

    // Process each category
    for (const category in fileGroups) {
      updateStatus(`Processing ${category} files...`, "loading");
      console.log(`Processing category: ${category}`);

      // Find or create category folder
      let categoryFolder = await findFolder(category, folderId, token);
      
      if (!categoryFolder) {
        console.log(`Creating new ${category} folder`);
        const createResponse = await fetch(
          "https://www.googleapis.com/drive/v3/files",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: category,
              mimeType: "application/vnd.google-apps.folder",
              parents: [folderId]
            })
          }
        );
        categoryFolder = await createResponse.json();
      } else {
        console.log(`Found existing ${category} folder`);
      }

      // Process each extension
      for (const extension in fileGroups[category]) {
        const files = fileGroups[category][extension];
        if (!files.length) continue;

        updateStatus(`Processing ${extension} files in ${category}...`, "loading");
        
        // Find or create extension subfolder
        let extensionFolder = await findFolder(extension, categoryFolder.id, token);
        
        if (!extensionFolder) {
          console.log(`Creating new ${extension} subfolder in ${category}`);
          const createResponse = await fetch(
            "https://www.googleapis.com/drive/v3/files",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: extension,
                mimeType: "application/vnd.google-apps.folder",
                parents: [categoryFolder.id]
              })
            }
          );
          extensionFolder = await createResponse.json();
        } else {
          console.log(`Found existing ${extension} subfolder in ${category}`);
        }

        // Move files to extension folder
        for (const file of files) {
          updateStatus(`Moving ${file.name}...`, "loading");
          console.log(`Moving ${file.name} to ${category}/${extension}/`);
          
          try {
            const moveResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${extensionFolder.id}&removeParents=${file.parents[0]}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json"
                }
              }
            );

            if (!moveResponse.ok) {
              throw new Error(`Failed to move ${file.name}`);
            }
          } catch (moveError) {
            console.error(`Error moving ${file.name}:`, moveError);
            updateStatus(`Error moving ${file.name}: ${moveError.message}`, "error");
          }
        }
      }
    }

    updateStatus("Files organized successfully!", "success");
  } catch (error) {
    updateStatus(error.message, "error");
    console.error("Organization error:", error);
  }
}

// File type mapping (same as background.js)
const fileTypeMap = {
  // Images
  jpg: "Images", jpeg: "Images", png: "Images", gif: "Images",
  webp: "Images", svg: "Images", tiff: "Images", bmp: "Images",
  ico: "Images", raw: "Images", heic: "Images",

  // Documents
  pdf: "Documents", doc: "Documents", docx: "Documents",
  txt: "Documents", xlsx: "Documents", csv: "Documents",
  xls: "Documents", ppt: "Documents", pptx: "Documents",
  odt: "Documents", rtf: "Documents", tex: "Documents",
  wpd: "Documents", md: "Documents", epub: "Documents",
  mobi: "Documents",

  // Videos
  mp4: "Videos", mkv: "Videos", avi: "Videos",
  mov: "Videos", wmv: "Videos", flv: "Videos",
  webm: "Videos", m4v: "Videos", "3gp": "Videos",
  mpeg: "Videos", mpg: "Videos",

  // Audio
  mp3: "Music", wav: "Music", m4a: "Music",
  flac: "Music", aac: "Music", ogg: "Music",
  wma: "Music", aiff: "Music", opus: "Music",
  mid: "Music", midi: "Music",

  // Archives
  zip: "Archives", rar: "Archives", "7z": "Archives",
  tar: "Archives", gz: "Archives", bz2: "Archives",
  xz: "Archives", tgz: "Archives", cab: "Archives",

  // Executables and Installers
  exe: "Software", msi: "Software", dmg: "Software",
  app: "Software", deb: "Software", rpm: "Software",
  iso: "Software", pkg: "Software", apk: "Software",

  // Web Files
  html: "Web", htm: "Web", css: "Web",
  js: "Web", json: "Web", xml: "Web"
};

// MIME type mapping (same as background.js)
const mimeTypeMap = {
  // Images
  "image/jpeg": "Images",
  "image/png": "Images",
  "image/gif": "Images",
  "image/webp": "Images",
  "image/svg+xml": "Images",
  "image/tiff": "Images",
  "image/bmp": "Images",
  "image/x-icon": "Images",
  "image/heic": "Images",

  // Documents
  "application/pdf": "Documents",
  "application/msword": "Documents",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Documents",
  "text/plain": "Documents",
  "application/vnd.ms-excel": "Documents",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Documents",
  "application/vnd.oasis.opendocument.text": "Documents",
  "application/rtf": "Documents",
  "text/markdown": "Documents",
  "application/epub+zip": "Documents",

  // Videos
  "video/mp4": "Videos",
  "video/x-matroska": "Videos",
  "video/x-msvideo": "Videos",
  "video/quicktime": "Videos",
  "video/webm": "Videos",
  "video/3gpp": "Videos",
  "video/mpeg": "Videos",

  // Audio
  "audio/mpeg": "Music",
  "audio/wav": "Music",
  "audio/ogg": "Music",
  "audio/flac": "Music",
  "audio/aac": "Music",
  "audio/midi": "Music",
  "audio/webm": "Music",

  // Archives
  "application/zip": "Archives",
  "application/x-rar-compressed": "Archives",
  "application/x-7z-compressed": "Archives",
  "application/x-tar": "Archives",
  "application/gzip": "Archives",
  "application/x-bzip2": "Archives",
  "application/x-compressed": "Archives",

  // Executables
  "application/x-msdownload": "Software",
  "application/x-msi": "Software",
  "application/x-apple-diskimage": "Software",
  "application/vnd.debian.binary-package": "Software",
  "application/x-rpm": "Software",
  "application/vnd.android.package-archive": "Software",

  // Web Files
  "text/html": "Web",
  "text/css": "Web",
  "text/javascript": "Web",
  "application/javascript": "Web",
  "application/json": "Web",
  "application/xml": "Web",
  "text/xml": "Web"
};

// Updated function to determine file category
function determineFileCategory(mimeType, fileExtension) {
  // First check for HTML files specifically
  if (mimeType === "text/html" || fileExtension === "html" || fileExtension === "htm") {
    return "Web";
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
  return "Others";
}

// Event Listeners
document.getElementById("organizeRoot").addEventListener("click", () => {
  organizeFolder("root");
});

document.getElementById("selectFolder").addEventListener("click", async () => {
  const folderList = document.getElementById("folderList");
  folderList.style.display = "block";
  folderList.innerHTML = "Loading folders...";

  try {
    const folders = await listDriveFolders();
    folderList.innerHTML = "";
    folders.forEach((folder) => {
      const div = document.createElement("div");
      div.className = "folder-item";
      div.textContent = folder.name;
      div.onclick = () => organizeFolder(folder.id);
      folderList.appendChild(div);
    });
  } catch (error) {
    folderList.innerHTML = "Error loading folders: " + error.message;
  }
});

// Add this function at the top
function updateStatus(message, type = 'info') {
    const status = document.getElementById('status');
    
    // Show the status div
    status.classList.add('show');
    status.className = `show ${type}`;
    
    if (type === 'loading') {
        status.innerHTML = `
            <div class="progress-text">${message}</div>
        `;
    } else {
        status.innerHTML = `
            <i class="material-icons" aria-hidden="true">${getStatusIcon(type)}</i>
            <div class="message">${message}</div>
        `;
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                status.classList.remove('show');
            }, 3000);
        }
    }
}

function getStatusIcon(type) {
    switch(type) {
        case 'success': return 'check_circle';
        case 'error': return 'error';
        default: return 'info';
    }
}
