// Memuat variabel lingkungan dari file .env
require('dotenv').config();

// Impor modul yang dibutuhkan
const puppeteer = require('puppeteer');
const readline = require('readline/promises');
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
 * Fungsi utama untuk menjalankan scraper.
 */
async function main() {
  if (!username || !password) {
    console.error('❌ MOODLE_USERNAME dan MOODLE_PASSWORD harus diisi di file .env');
    return;
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    let loggedIn = false;

    // --- LANGKAH 1: MENCOBA LOGIN VIA SESSION ---
    try {
      console.log('🔄 Mengecek session yang tersimpan...');
      const cookiesString = await fs.readFile(SESSION_FILE_PATH);
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
      
      console.log('⏳ Memvalidasi session...');
      await page.goto(coursesURL, { waitUntil: 'networkidle2' });

      await page.waitForSelector('.usermenu', { timeout: 5000 });
      console.log('✅ Login berhasil via session!');
      loggedIn = true;
    } catch (error) {
      console.log('⚠️ Session tidak ditemukan atau tidak valid. Melanjutkan dengan login manual...');
      loggedIn = false;
    }

    // --- LANGKAH 2: LOGIN MANUAL JIKA SESSION GAGAL ---
    if (!loggedIn) {
      console.log('🚀 Membuka halaman login...');
      await page.goto(loginURL, { waitUntil: 'networkidle2' });
      console.log('✍️  Mengisi username dan password...');
      await page.type('#username', username);
      await page.type('#password', password);
      console.log('🔐 Mengklik tombol login...');
      await page.click('#loginbtn');
      console.log('⏳ Menunggu proses login selesai...');
      await page.waitForSelector('.usermenu', { timeout: 15000 });
      console.log('✅ Login berhasil!');

      const cookies = await page.cookies();
      await fs.writeFile(SESSION_FILE_PATH, JSON.stringify(cookies, null, 2));
      console.log('💾 Session disimpan ke file session.json!');
    }
    
    // --- LANGKAH 3: SCRAPE DATA MATA KULIAH ---
    console.log('\n📚 Mengambil data semua mata kuliah Anda...');
    if (!loggedIn) await page.goto(coursesURL, { waitUntil: 'networkidle2' });

    const courseBoxSelector = 'div[data-course-id]';
    await page.waitForSelector(courseBoxSelector);
    
    const courses = await page.$$eval(courseBoxSelector, (boxes) => {
      return boxes.map(box => {
        const linkElement = box.querySelector('a.aalink');
        return {
          name: linkElement ? linkElement.innerText.trim() : '',
          url: linkElement ? linkElement.href : '',
        };
      });
    });
    console.log(`✅ ${courses.length} mata kuliah berhasil di-scan.`);

    // --- LANGKAH 4: INTERAKSI & CARI KATA KUNCI ---
    const keyword = await rl.question('\n🔎 Masukkan Nama Matakuliah yang ingin dicari: ');
    
    console.log(`\n🕵️ Mencari Course dengan keyword "${keyword}"...`);
    const foundCourse = courses.find(course =>
      course.name.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!foundCourse) {
      console.log('❌ Course tidak ditemukan.');
      return;
    }

    console.log('✅ Course ditemukan!');
    console.log(`   Link: ${foundCourse.url}`);
    
    // --- LANGKAH 5: CARI CURRENT WEEK & AKTIVITAS ---
    console.log('\n➡️  Membuka halaman course...');
    await page.goto(foundCourse.url, { waitUntil: 'networkidle2' });
    
    console.log('🔍 Mencari Section Current Week...');
    const currentSectionSelector = '.section.current';
    await page.waitForSelector(currentSectionSelector, { timeout: 10000 });

    const sectionInfo = await page.$eval(currentSectionSelector, (section) => {
      const id = section.id;
      const dateElement = section.querySelector('h3.sectionname a');
      const dateText = dateElement ? dateElement.innerText.trim() : 'Tanggal tidak ditemukan';
      return { id, dateText };
    });

    if (!sectionInfo || !sectionInfo.id) {
      console.log('❌ Gagal menemukan ID untuk section minggu ini.');
      return;
    }

    const currentWeekLink = `${foundCourse.url}#${sectionInfo.id}`;
    
    console.log(`\n✨ Current Week: ${sectionInfo.dateText}`);
    console.log(`   Link Section: ${currentWeekLink}`);

    const activities = await page.$eval(currentSectionSelector, (section) => {
      const quizElement = section.querySelector('li.activity.quiz a');
      const forumElement = section.querySelector('li.activity.forum a');
      const gmeetElement = section.querySelector('li.activity.googlemeet a');
      const moduleElement = section.querySelector('li.activity.url a');
      // **PENAMBAHAN BARU: Selector untuk Assignment (Tugas)**
      const assignmentElement = section.querySelector('li.activity.assign a');

      return {
        quizLink: quizElement ? quizElement.href : null,
        forumLink: forumElement ? forumElement.href : null,
        gmeetLink: gmeetElement ? gmeetElement.href : null,
        moduleLink: moduleElement ? moduleElement.href : null,
        assignmentLink: assignmentElement ? assignmentElement.href : null,
      };
    });

    console.log(`   Link Quiz : ${activities.quizLink || 'Tidak Ada Quiz'}`);
    console.log(`   Link Forum : ${activities.forumLink || 'Tidak Ada Forum'}`);
    console.log(`   Link Gmeet : ${activities.gmeetLink || 'Tidak Ada Gmeet'}`);
    console.log(`   Link Module: ${activities.moduleLink || 'Tidak Ada Module'}`);
    // **PENAMBAHAN BARU: Tampilkan hasil pencarian Assignment**
    console.log(`   Link Tugas : ${activities.assignmentLink || 'Tidak Ada Tugas'}`);
    
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.log('❌ Gagal menemukan elemen yang dicari (timeout). Mungkin section "current" tidak ada?');
    } else {
      console.error('❌ Terjadi kesalahan:', error.message);
    }
  } finally {
    rl.close();
    console.log('\n🎉 Proses selesai. Browser tetap terbuka. Anda bisa menutupnya secara manual.');
  }
}

main();