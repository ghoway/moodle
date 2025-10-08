require('dotenv').config();
const fs = require('fs/promises');

// --- KONSTANTA ---
const baseURL = 'https://kuliahonline.undira.ac.id';
const loginURL = `${baseURL}/login/index.php`;
const coursesURL = `${baseURL}/my/courses.php`;
const SESSION_FILE_PATH = 'session.json';

// Ambil kredensial dari file .env
const username = process.env.MOODLE_USERNAME;
const password = process.env.MOODLE_PASSWORD;

/**
 * Fungsi utama scraper yang akan dipanggil oleh bot.
 * @param {import('puppeteer').Browser} browser - Instance browser Puppeteer yang sedang berjalan.
 * @param {string} keyword - Kata kunci mata kuliah yang dicari.
 * @returns {Promise<object|null>} Objek berisi data atau null jika tidak ditemukan.
 */
async function scrapeMoodle(browser, keyword) {
  const page = await browser.newPage();
  try {
    // Menyamar sebagai browser biasa
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    let loggedIn = false;

    // Coba login via session
    try {
      const cookiesString = await fs.readFile(SESSION_FILE_PATH);
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
      await page.goto(coursesURL, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('.usermenu', { timeout: 5000 });
      loggedIn = true;
    } catch (error) {
      loggedIn = false;
    }

    // Login manual jika session gagal
    if (!loggedIn) {
      await page.goto(loginURL, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.type('#username', username);
      await page.type('#password', password);
      await page.click('#loginbtn');
      await page.waitForSelector('.usermenu', { timeout: 15000 });
      const cookies = await page.cookies();
      await fs.writeFile(SESSION_FILE_PATH, JSON.stringify(cookies, null, 2));
    }

    if (!loggedIn) await page.goto(coursesURL, { waitUntil: 'networkidle2', timeout: 60000 });

    const courseBoxSelector = 'div[data-course-id]';
    await page.waitForSelector(courseBoxSelector);
    
    const courses = await page.$$eval(courseBoxSelector, (boxes) =>
      boxes.map(box => {
        const linkElement = box.querySelector('a.aalink');
        return {
          name: linkElement ? linkElement.innerText.trim() : '',
          url: linkElement ? linkElement.href : '',
        };
      })
    );

    const foundCourse = courses.find(course =>
      course.name.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!foundCourse) return { error: 'Course tidak ditemukan.' };

    await page.goto(foundCourse.url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    const currentSectionSelector = '.section.current';
    await page.waitForSelector(currentSectionSelector, { timeout: 10000 });

    const sectionInfo = await page.$eval(currentSectionSelector, (section) => {
      const id = section.id;
      const dateElement = section.querySelector('h3.sectionname a');
      const dateText = dateElement ? dateElement.innerText.trim() : null;
      
      const quizElement = section.querySelector('li.activity.quiz a');
      const forumElement = section.querySelector('li.activity.forum a');
      const gmeetElement = section.querySelector('li.activity.googlemeet a');
      const moduleElement = section.querySelector('li.activity.url a');
      const assignmentElement = section.querySelector('li.activity.assign a'); // <-- Tambahan

      return {
        id,
        dateText,
        quizLink: quizElement ? quizElement.href : null,
        forumLink: forumElement ? forumElement.href : null,
        gmeetLink: gmeetElement ? gmeetElement.href : null,
        moduleLink: moduleElement ? moduleElement.href : null,
        assignmentLink: assignmentElement ? assignmentElement.href : null, // <-- Tambahan
      };
    });

    if (!sectionInfo || !sectionInfo.id) return { error: 'Section aktif tidak ditemukan.' };

    const cleanCourseName = foundCourse.name.includes('\n') 
      ? foundCourse.name.split('\n')[1].trim() 
      : foundCourse.name.trim();

    return {
      courseName: cleanCourseName,
      weekDate: sectionInfo.dateText,
      sectionLink: `${foundCourse.url}#${sectionInfo.id}`,
      quizLink: sectionInfo.quizLink,
      forumLink: sectionInfo.forumLink,
      gmeetLink: sectionInfo.gmeetLink,
      moduleLink: sectionInfo.moduleLink,
      assignmentLink: sectionInfo.assignmentLink, // <-- Tambahan
    };

  } catch (error) {
    console.error("Error di dalam scraper:", error);
    return { error: 'Terjadi kesalahan saat scraping. Coba lagi nanti.' };
  } finally {
    await page.close();
  }
}

module.exports = { scrapeMoodle };