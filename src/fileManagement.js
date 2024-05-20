
let rootFolder = null;

const setRootFolder = (folder) => {
  rootFolder = folder;
  if (rootFolder?.endsWith('/')) {
    rootFolder = rootFolder.slice(0, -1);
  }
};

const getFileFolder = (lang) => {
  const langBit = (!!lang) ? `${lang}/` : '';
  return `${rootFolder}/${langBit}`;
};

const getImageFolder = () => {
  return `images/`;
};

const getFilePath = (slug, lang) => {
  const fileFolder = getFileFolder(lang);
  return `${fileFolder}${slug}.md`;
};

const getImageFolderPath = (slug) => {
  return `images/${slug}/`;
};

module.exports = {
  setRootFolder,
  getFileFolder,
  getImageFolder,
  getFilePath,
  getImageFolderPath
}
