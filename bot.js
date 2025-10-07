const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const { scrapeMoodle } = require('./src/moodleScraper');

async function connectToWhatsApp() {
  console.log('🚀 Meluncurkan browser untuk scraping...');
  // Browser akan berjalan terus menerus bersama bot untuk performa maksimal
  const browser = await puppeteer.launch({
    headless: 'new', // Mode headless agar tidak muncul jendela browser
  });

  // Menggunakan MultiFileAuthState untuk menyimpan session WhatsApp
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }), // Menyembunyikan log dari Baileys
    auth: state,
  });

  // Listener untuk menyimpan kredensial setiap kali diperbarui
  sock.ev.on('creds.update', saveCreds);

  // Listener untuk memantau status koneksi
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('------------------------------------------------');
      console.log('Silakan scan QR code ini untuk menghubungkan WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('------------------------------------------------');
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus karena:', lastDisconnect.error, ', menyambungkan ulang:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        // Jika koneksi terputus permanen (logged out), tutup browser juga
        browser.close().then(() => console.log('Browser ditutup karena bot logout.'));
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp berhasil terhubung!');
    }
  });

  // Listener utama untuk pesan masuk
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return; // Abaikan jika pesan kosong

    // Ekstrak teks pesan
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text || !text.toLowerCase().startsWith('.kulon')) return; // Abaikan jika bukan perintah

    // Ekstrak kata kunci dari perintah
    const keyword = text.substring(6).trim();
    if (!keyword) {
      await sock.sendMessage(msg.key.remoteJid, { text: 'Gunakan format: .kulon (nama matakuliah)' }, { quoted: msg });
      return;
    }

    try {
      // Kirim pesan "sedang diproses"
      await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mencari data untuk matakuliah "*${keyword}*", mohon tunggu...` }, { quoted: msg });
      
      // Panggil fungsi scraper
      const result = await scrapeMoodle(browser, keyword);

      // Tangani jika scraper mengembalikan error
      if (result.error) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ ${result.error}` }, { quoted: msg });
        return;
      }

      // Format balasan akhir
      const reply = [
        `*${result.courseName} - ${result.weekDate}*`,
        `└ Section : ${result.sectionLink}`,
        `└ Quiz : ${result.quizLink || 'Tidak Ada Quiz'}`,
        `└ Forum : ${result.forumLink || 'Tidak Ada Forum'}`,
        `└ Gmeet : ${result.gmeetLink || 'Tidak Ada Gmeet'}`,
        `└ Module : ${result.moduleLink || 'Tidak Ada Module'}`
      ].join('\n');
      
      // Kirim balasan
      await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });

    } catch (err) {
      console.error(err);
      await sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi error internal saat memproses permintaan Anda.' }, { quoted: msg });
    }
  });
}

// Jalankan fungsi utama untuk memulai bot
connectToWhatsApp();