// Function to get system special folder paths
async function getSystemPath(fileType) {
  switch (fileType) {
    case 'image':
      return 'C:/Users/' + (await chrome.runtime.getPlatformInfo()).username + '/Pictures';
    case 'video':
      return 'C:/Users/' + (await chrome.runtime.getPlatformInfo()).username + '/Videos';
    case 'document':
      return 'C:/Users/' + (await chrome.runtime.getPlatformInfo()).username + '/Documents';
    case 'music':
      return 'C:/Users/' + (await chrome.runtime.getPlatformInfo()).username + '/Music';
    case 'executable':
      return 'C:/Users/' + (await chrome.runtime.getPlatformInfo()).username + '/Downloads';
    default:
      return 'C:/Users/' + (await chrome.runtime.getPlatformInfo()).username + '/Downloads';
  }
}

const fileTypeMap = {
  // Images
  'jpg': 'image',
  'jpeg': 'image',
  'png': 'image',
  'gif': 'image',
  'webp': 'image',
  
  // Documents
  'pdf': 'document',
  'doc': 'document',
  'docx': 'document',
  'txt': 'document',
  'xlsx': 'document',
  
  // Videos
  'mp4': 'video',
  'mkv': 'video',
  'avi': 'video',
  
  // Audio
  'mp3': 'music',
  'wav': 'music',

  // Executables and Installers
  'exe': 'executable',
  'msi': 'executable',
  'dmg': 'executable',
  'app': 'executable',
  'deb': 'executable',
  'rpm': 'executable'
};

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const fileName = downloadItem.filename;
  const fileExtension = fileName.split('.').pop().toLowerCase();
  
  if (fileTypeMap[fileExtension]) {
    getSystemPath(fileTypeMap[fileExtension]).then(basePath => {
      // Create path with extension-specific subfolder
      const newPath = fileTypeMap[fileExtension] === 'executable' ? 
        `Software/${fileExtension}/${fileName}` : // Executables go to Downloads/Software/exe/
        `${fileExtension}/${fileName}`; // Other files go to their respective folders
      
      console.log('Redirecting download to:', basePath + '/' + newPath);
      
      suggest({
        filename: newPath,
        conflict_action: 'uniquify'
      });
    });
  } else {
    suggest();
  }
  
  return true;
});