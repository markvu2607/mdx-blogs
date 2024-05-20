// const NotionParse = require('@kodaps/notion-parse');
const NotionParse = require("../src/parse-notion")
const dotenv = require('dotenv');

dotenv.config();

const go = async () => {

  if (process.env.NOTION_SECRET) {
    await NotionParse.parseNotion(process.env.NOTION_SECRET, './md', [
      {
        databaseId: process.env.NOTION_BLOG_DATABASE_ID || '',
      },
    ])
  }

};

go().then(() => {
  console.log('Done');
});
