import Parser from 'rss-parser';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

const parser = new Parser();

// חמשת המקורות הכלכליים
const FEEDS = [
  { name: 'Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home/international' },
  { name: 'The Economist', url: 'https://www.economist.com/finance-and-economics/rss.xml' },
  // ל-Bloomberg ו-Reuters אין יותר RSS רשמי, אז משתמשים ב-Google News כתחליף אמין
  { name: 'Bloomberg', url: 'https://news.google.com/rss/search?q=site:bloomberg.com+when:1d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Reuters', url: 'https://news.google.com/rss/search?q=site:reuters.com+business+when:1d&hl=en-US&gl=US&ceid=US:en' },
];

const ITEMS_PER_FEED = 5;

// תרגום חינמי דרך MyMemory API (ללא צורך במפתח)
async function translateToHebrew(text) {
  if (!text) return '';
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 480));
    remaining = remaining.slice(480);
  }
  const translated = [];
  for (const chunk of chunks) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|he`;
      const res = await fetch(url);
      const data = await res.json();
      translated.push(data?.responseData?.translatedText || chunk);
    } catch (err) {
      console.error('Translation error:', err.message);
      translated.push(chunk);
    }
    await new Promise((r) => setTimeout(r, 600)); // עדינות מול מגבלת הקצב של השירות החינמי
  }
  return translated.join(' ');
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function buildDigest() {
  let html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">`;
  html += `<h1 style="color:#1a1a2e;">📰 סיכום כלכלי יומי</h1>`;
  html += `<p style="color:#666;">${new Date().toLocaleDateString('he-IL')}</p>`;

  for (const feed of FEEDS) {
    console.log(`Fetching ${feed.name}...`);
    html += `<h2 style="border-bottom:2px solid #333;padding-bottom:5px;">${feed.name}</h2>`;
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items.slice(0, ITEMS_PER_FEED);

      if (items.length === 0) {
        html += `<p style="color:#999;">לא נמצאו כתבות היום</p>`;
        continue;
      }

      for (const item of items) {
        const titleEn = item.title || '';
        const descEn = stripHtml(item.contentSnippet || item.content || item.summary || '');

        const titleHe = await translateToHebrew(titleEn);
        const descHe = descEn ? await translateToHebrew(descEn.slice(0, 400)) : '';

        html += `<div style="margin-bottom:15px;">`;
        html += `<a href="${item.link}" style="font-size:16px;font-weight:bold;color:#1a1a2e;text-decoration:none;">${titleHe}</a>`;
        if (descHe) html += `<p style="color:#444;margin:5px 0;">${descHe}</p>`;
        html += `</div>`;
      }
    } catch (err) {
      console.error(`Error fetching ${feed.name}:`, err.message);
      html += `<p style="color:#999;">לא ניתן היה לטעון את ${feed.name} היום</p>`;
    }
  }

  html += `</div>`;
  return html;
}

async function sendEmail(html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.RECIPIENT_EMAIL,
    subject: `סיכום כלכלי יומי - ${new Date().toLocaleDateString('he-IL')}`,
    html,
  });

  console.log('Email sent successfully');
}

(async () => {
  try {
    const digest = await buildDigest();
    await sendEmail(digest);
  } catch (err) {
    console.error('Failed to build/send digest:', err);
    process.exit(1);
  }
})();
