const { Client } = require("@notionhq/client")
const { DatabaseObjectResponse, PageObjectResponse, PartialDatabaseObjectResponse, PartialPageObjectResponse } = require("@notionhq/client/build/src/api-endpoints")
const { NotionToMarkdown } = require("notion-to-md")
const { getFileFolder, getFilePath, getImageFolder, getImageFolderPath, setRootFolder } = require("./fileManagement")

const yaml = require('yaml');
const fs = require('fs');
const http = require('https');
const slugify = require('slugify');
const Jimp = require('jimp');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let notionClient = null;

let n2m = null;

const setNotionSecret = (auth) => {
  notionClient = new Client({
    auth,
  });

  n2m = new NotionToMarkdown({ notionClient });

}

const documentTypes = [];

const addDocumentTypes = (types) => {
  documentTypes.push(...types);
}


const downloadImage = async (fileUrl, destination) => {

  const file = destination; // `/images/${folder}/${name}`;

  if (!fs.existsSync(file)) {
    await wget(fileUrl, file); //element.properties.image.files[0].file.url, file);
  }

  let img = await Jimp.read(file);

  const width = img.getWidth();
  const height = img.getHeight();

  return {
    src,
    width,
    height,
  };
};


const manageImage = async (properties, url, contentType, name) => {

  const title = await getFieldInfo(properties, 'title', contentType);

  const slug = await getFieldInfo(properties, 'slug', contentType) || slugify(title, {
    lower: true,
    strict: true,
  });

  if (!slug) {
    throw new Error('No slug');
  }

  checkFolder(getImageFolder());

  const destination = getImageFolder() + name;

  return await downloadImage(url, destination);

}


const getFieldInfo = async (properties, name, contentType) => {
  const element = properties[name];

  if (!element) {
    return null;
  }

  const type = element.type;

  switch (type) {
    case 'title':
      return element.title[0]?.plain_text;
    case 'rich_text':
      return element.rich_text[0]?.plain_text;
    case 'date':
      return element.date?.start;
    case 'url':
      return element.url;
    case 'checkbox':
      return element.checkbox;
    case 'number':
      return element.number;
    case 'select':
      return element.select?.name;
    case 'created_time':
      return element.created_time;
    case 'last_edited_time':
      return element.last_edited_time;
    case 'email':
      return element.email;
    case 'status':
      return element.status;
    case 'formula':
      return element.formula.number;
    case 'phone_number':
      return element.phone_number;
    case 'relation':
      return element.relation.map((item) => item.id);
    case 'multi_select':
      return element.multi_select.map((item) => item.name);
    case 'files':

      let url = element.files[0]?.url || element.files[0]?.file?.url;
      if (!url) {
        return null;
      }
      return await manageImage(properties, url, contentType, element.files[0]?.name);
    default:
      throw new Error(`Unknown type ${type}`);
  }
};



const toFrontMatter = (data) => '---\n' + yaml.stringify(data) + '\n---\n';


function wget(url, dest) {
  return new Promise((res) => {
    http.get(url, (response) => {
      if (response.statusCode == 302) {
        // if the response is a redirection, we call again the method with the new location
        console.log('redirecting to ', response.headers.location);
        wget(String(response.headers.location), dest);
      } else {
        console.log('Downloading', url, 'to', dest);
        const file = fs.createWriteStream(dest);

        response.pipe(file);
        file.on('finish', function () {
          file.close();
          res();
        });
      }
    });
  });
}


const parseNotionPage = async (page, contentType, debug = false ) => {
  const obj = {
    notionId: page.id,
    type: contentType,
  };

  if ('properties' in page) {
    for (let field in (page.properties || {})) {

      const value = await getFieldInfo(page.properties, field, contentType);
      if (value !== null && value !== undefined && !obj[field]) {
        obj[field] = value;
      }
    }
  }

  return obj;
};

const checkFolder = (dir) => {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}
}

const getDatabase = async (notion, database_id, contentType, debug = false) => {
  const request = await notion.databases.query({
    database_id,
  });

  const results = request.results;

  let ret = [];

  if (debug) {
    console.log(`Got ${results.length} results from ${contentType} database`);
  }

  for (let page of results) {
    let item = await parseNotionPage(page, contentType, debug);
    ret.push(item);
  }

  return ret;
};

const saveFile = async (frontMatter, languageField) => {

  if (!n2m) {
    throw new Error('Notion client not set');
  }

  const notionId = frontMatter['notionId'];
  const lang = languageField ? frontMatter[languageField] : '';

  if (lang) {
    checkFolder(getFileFolder(lang));
  }

  const title = frontMatter['title'];

  if (!title && !frontMatter['slug']) {
    throw new Error(`No title or slug in front matter for ${notionId}`);
  }

  const slug = frontMatter['slug'] || slugify(title, {
    lower: true,
    strict: true,
  });

  frontMatter['slug'] = slug;

  const mdblocks = await n2m.pageToMarkdown(notionId);

  const imageBlocks = mdblocks.filter((block) => block.type === 'image').map((block) => block.parent);

  let images = [];

  let imagePath =  getImageFolderPath(slug);

  console.log('checking imagePath ./' + imagePath)

  checkFolder('./' + imagePath);

  for (let block of imageBlocks) {

    let data = block.replace('![', '').replace(']', '').replace(')', '').split('(');

    if (data.length !== 2) {
      console.log('Error with image block: ', block);
      continue;
    }

    const url = data[1];
    const name = data[0];
    const ext = url.split("fm=")[1].split("&")[0]

    const filename = name.split('/').pop() + "." + ext;

    const src = imagePath + filename;

    const file = `./${src}`;
    if (!fs.existsSync(file)) {
      await wget(url, file);
    }

    images.push({
      src,
      url,
      name
    });
  }

  const mdBody = n2m.toMarkdownString(mdblocks);

  for (let image of images) {
    mdBody.parent = mdBody.parent.replace(image.url, "https://raw.githubusercontent.com/markvu2607/mdx-blogs/main/" + image.src);
  }


  const newFile = getFilePath(slug, lang);

  try {
    fs.writeFileSync(newFile, toFrontMatter(frontMatter) + mdBody.parent);
  } catch (e) {
    console.log('error with file: ', newFile);
    console.error(e);
  }
};



const parseNotion = async (token, contentRoot, contentTypes, debug = false) => {

  console.log('Fetching data from Notion');

  setNotionSecret(token);

  setRootFolder(contentRoot);

  addDocumentTypes(contentTypes);

  if (!notionClient) {
    throw new Error('Notion client incorretly setup');
  }


  for (let type of contentTypes) {

    const databaseId = type.databaseId;
    const lang = type.languageField;

    if (!databaseId) {
      throw new Error('No database id');
    }

    console.log(`Fetching data`);

    const database = await getDatabase(notionClient, databaseId, undefined, debug);

    if (!database.length) {
      console.error(`Got ${database.length} items`);
    }

    console.log("checking "+ contentRoot);
    checkFolder(contentRoot);

    for (let page of database) {
      sleep(400);

      for(let field of (type.filterFields || [])) {
        if (page[field]) {
          delete page[field];
        }
      }

      await saveFile(page, lang);

    }
  }
}

module.exports = {
  parseNotionPage,
  parseNotion
}
