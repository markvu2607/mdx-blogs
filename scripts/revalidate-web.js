const dotenv = require('dotenv');

dotenv.config();

fetch(`${process.env.REVALIDATE_URL}?secret=${process.env.REVALIDATE_SECRET}`)
