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

// Function to organize files in a folder
async function organizeFolder(folderId) {
  const token = await getAuthToken();
  const status = document.getElementById("status");
  status.textContent = "Organizing files...";

  try {
    // Get all files with detailed information
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q="${folderId}" in parents and mimeType != 'application/vnd.google-apps.folder'&fields=files(id,name,mimeType,parents)&pageSize=1000`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to fetch files: ${error.message}`);
    }

    const data = await response.json();
    console.log("Files fetched:", data.files);

    const files = data.files;
    if (!files || files.length === 0) {
      status.textContent = "No files found to organize!";
      return;
    }

    // Group files by category and extension
    const fileGroups = {};
    
    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") continue;

      const fileName = file.name;
      const fileExtension = fileName.split('.').pop().toLowerCase();
      const category = determineFileCategory(file.mimeType, fileExtension);
      
      if (category) {
        if (!fileGroups[category]) {
          fileGroups[category] = {};
        }
        if (!fileGroups[category][fileExtension]) {
          fileGroups[category][fileExtension] = [];
        }
        fileGroups[category][fileExtension].push(file);
      }
    }

    // Process each category
    for (const category in fileGroups) {
      if (Object.keys(fileGroups[category]).length === 0) continue;

      status.textContent = `Creating ${category} folder...`;
      console.log(`Creating category folder: ${category}`);

      // Create category folder
      const categoryFolderResponse = await fetch(
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

      if (!categoryFolderResponse.ok) {
        const error = await categoryFolderResponse.json();
        throw new Error(`Failed to create category folder: ${error.message}`);
      }

      const categoryFolder = await categoryFolderResponse.json();
      console.log(`Created category folder with ID: ${categoryFolder.id}`);

      // Process each extension
      for (const extension in fileGroups[category]) {
        const files = fileGroups[category][extension];
        if (files.length === 0) continue;

        status.textContent = `Creating ${extension} folder...`;
        console.log(`Creating extension folder: ${extension}`);

        // Create extension subfolder
        const extensionFolderResponse = await fetch(
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

        if (!extensionFolderResponse.ok) {
          const error = await extensionFolderResponse.json();
          throw new Error(`Failed to create extension folder: ${error.message}`);
        }

        const extensionFolder = await extensionFolderResponse.json();
        console.log(`Created extension folder with ID: ${extensionFolder.id}`);

        // Move each file
        for (const file of files) {
          status.textContent = `Moving ${file.name}...`;
          console.log(`Attempting to move file:`, {
            fileName: file.name,
            fileId: file.id,
            currentParents: file.parents,
            targetFolder: extensionFolder.id
          });
          
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

            const moveResult = await moveResponse.json();
            console.log('Move response:', moveResult);

            if (!moveResponse.ok) {
              throw new Error(`Move failed: ${moveResult.error?.message || 'Unknown error'}`);
            }

            console.log(`Successfully moved file: ${file.name}`);
          } catch (moveError) {
            console.error(`Detailed error moving file ${file.name}:`, moveError);
            status.textContent = `Error moving ${file.name}: ${moveError.message}`;
          }
        }
      }
    }

    status.textContent = "Files organized successfully!";
  } catch (error) {
    status.textContent = "Error: " + error.message;
    console.error("Organization error:", error);
  }
}

// Updated function to determine file category using both MIME type and extension
function determineFileCategory(mimeType, fileExtension) {
  // First check for HTML files specifically
  if (
    mimeType === "text/html" ||
    fileExtension === "html" ||
    fileExtension === "htm"
  ) {
    return "Web";
  }

  // Then try to determine by MIME type
  if (mimeType.startsWith("image/")) return "Images";
  if (mimeType.startsWith("video/")) return "Videos";
  if (mimeType.startsWith("audio/")) return "Music";
  if (mimeType.includes("pdf") || 
      mimeType.includes("document") ||
      mimeType.includes("text/")) return "Documents";
  if (mimeType.includes("zip") || 
      mimeType.includes("compressed") ||
      mimeType.includes("archive")) return "Archives";

  // Fall back to extension if MIME type is not conclusive
  const extensionMap = {
    // Images
    jpg: "Images", jpeg: "Images", png: "Images", gif: "Images",
    webp: "Images", svg: "Images", tiff: "Images", bmp: "Images",
    
    // Documents
    pdf: "Documents", doc: "Documents", docx: "Documents",
    txt: "Documents", xlsx: "Documents", xls: "Documents",
    ppt: "Documents", pptx: "Documents",
    
    // Videos
    mp4: "Videos", mkv: "Videos", avi: "Videos",
    mov: "Videos", wmv: "Videos", flv: "Videos",
    
    // Audio
    mp3: "Music", wav: "Music", m4a: "Music",
    flac: "Music", aac: "Music", ogg: "Music",
    
    // Archives
    zip: "Archives", rar: "Archives", "7z": "Archives",
    tar: "Archives", gz: "Archives"
  };

  return extensionMap[fileExtension] || "Others";
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
